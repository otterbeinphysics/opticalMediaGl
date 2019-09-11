
$(function(){
  applet = new Applet($('div#sim'));
});

var vertex_shader = `
  varying vec2 vUv;
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec3 vViewDirection;

   void main() {
       vUv = uv;
       vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
       vPosition = (modelMatrix *
           vec4(position,1.0)).xyz;
       gl_Position = projectionMatrix * mvPosition;
      vec3 transformedNormal = normalMatrix *  vec3( normal );
      vNormal = normalize( transformedNormal );
      vViewDirection = normalize(mvPosition.xyz);
  }`
;

var fragment_shader = `
#define PI 3.1415926535897932384626433832795
#define MAX_ATOMS 1000

precision mediump float;

// set of textures in tdc dimention, consecutive.  The y-coordinate of all of these should be identical.

varying vec2  vUv;
varying vec3  vPosition;
varying vec3  vNormal;
varying vec3  vViewDirection;

uniform float t;
uniform float tstop;
uniform float amp;
uniform float wavelength;
uniform float period;
uniform float velocity;
uniform float phase;
uniform float scatteramp;
uniform float ymin;
uniform float ymax;
uniform int   natoms;
uniform int   show_primary;
uniform int   do_rescatter;
uniform vec2 atoms[MAX_ATOMS];

float planeWave(vec2 xy, float t1)
{
  if(xy.y<ymin) return 0.0;
  if(xy.y>ymax) return 0.0;
  // retarded time: wave phase at x=0
  float tr = t1 - xy.x/velocity;
  if(tr<0.0) return 0.0;
  if(tr>tstop) return 0.0;
  return amp * sin(-PI*2.0*tr/period);
}

float scatteredField(vec2 xy, float t1, vec2 atom, out float r)
{
  // distance to atom
  r = distance(atom,xy);
  float dt = r/velocity;
  dt -= phase*period/(2.0*PI);
  float scat = scatteramp * planeWave(atom,t1-dt)/(r);
  // console.log(atom,x,y,t,r,dt,scat);
  return scat;
}


float RescatteredField(vec2 xy,float t1, vec2 jatom, const int j, out float r)
{

  r = distance(jatom,xy);
  float dt = r/velocity;
  dt = phase*period/(2.0*PI);
  float retarded_time = t1-dt;

  float psi = planeWave(jatom,retarded_time); // field at atom

  for(int i=0;i<MAX_ATOMS;i++) {
    if(i>=natoms) break;
    if(i==j) continue;
    psi += scatteredField(jatom, retarded_time, atoms[i],r);
  }

  // Now scatter THAT field.
  return scatteramp * psi/r;

}

void main() {
  // vUv is the normalized U,V coordinate in the object which nominally
  // maps to inputtexture(u,v).  However, we're going to manipulate it:
  float psi = 0.0;
  if(show_primary>0)
    psi += planeWave(vUv,t);


  float min_r = 1e9;
  float r;
  for(int i=0;i<MAX_ATOMS;i++) {
    if(i>=natoms) break;
    psi += scatteredField(vUv, t, atoms[i],r);
    if(do_rescatter>0)
      psi += RescatteredField(vUv, t, atoms[i], i, r);
    float r = distance(atoms[i],vUv);    
    if(r<min_r) min_r = r;
  }

  float close_to_atom =  smoothstep( 0.001, 0.0025, min_r );

  gl_FragColor =mix(
                  vec4( 0.0, 1.0, 0.0, 1.0),
                  vec4( psi*0.4 + 0.5, 
                      0.0, 
                      psi * 0.4 + 0.5, 
                      1.0),
                  close_to_atom
                  );
} 
`;

function Applet(element, options)
{
  if(!element) { 
    console.log("Pad: NULL element provided."); return; 
  }
  if($(element).length<1) { 
    console.log("Pad: Zero-length jquery selector provided."); return;
  }
  this.element = $(element).get(0); 
  
  this.bg_color = "white";
  this.origin_x = 0.0;
  this.origin_y = 0.0;
  this.width_x  = 10.0;
  
  // Merge in the options.
  $.extend(true,this,options);

  // Merge in options from element
  var element_settings = $(element).attr('settings');
  var element_settings_obj={};

  var self = this;

  this.width  = $(this.element).width();
  this.height = $(this.element).height();
  this.renderer = new THREE.WebGLRenderer();
  this.renderer.setSize(this.width,this.height);
  this.resolution = new THREE.Vector2(this.width,this.height);
  this.renderer.setPixelRatio( window.devicePixelRatio );  
  this.element.appendChild( this.renderer.domElement );

  // Create an orthographic camera
  this.scene = new THREE.Scene();
  this.aspect = this.height/this.width;
  this.camera = new THREE.OrthographicCamera(0,1, -0.5*this.aspect,0.5*this.aspect, 1,1000);
  this.camera.position.z=500;
  this.scene.add(this.camera);

  this.amp = 0.5;

  this.ymin = 0.25;
  this.ymax = 0.75;
  $('#show-width').text(self.ymax-self.ymin);


  this.wavelength = parseFloat($("#ctl-wavelength").val())/1000;
  $('#show-wavelength').text(self.wavelength*1000);

  this.period = parseFloat($("#ctl-period").val());
  $('#show-period').text(self.period);

  self.v = self.wavelength/self.period;

  self.phase_deg = parseFloat($("#ctl-phase").val());
  $('#show-phase').html(self.phase_deg + "&deg;");
  self.phase = ((self.phase_deg)%360)/180*Math.PI;


  this.animating = true;
  this.last_frame_t = Date.now();
  this.t_ms = 0;

  this.scatteramp = 0.01;

  this.tstop = 10; // 10 seconds later, stop the sim.

  this.show_primary = 1;

  this.do_rescatter = false;



  var uniforms = {
    t: { type:"f", value: 0},
    tstop: {type: "f", value:0},
    amp: {type: "f", value: 0},
    wavelength: {type:"f", value: 0},
    period: {type:"f", value: 0},
    velocity: {type:"f", value:0},
    phase: {type:"f", value: 0},
    scatteramp: {type:"f", value: 0},
    ymin: {type:"f", value: 0},
    ymax: {type:"f", value: 0},
    show_primary: {type:"i", value: 0},
    do_rescatter: {type:"i", value: 0},

    natoms: {type:"i", value:0},
    atoms: { type: "fv", value: [0,0]},    
  }

  this.material = new THREE.ShaderMaterial( {
      vertexShader:   vertex_shader,
      fragmentShader: fragment_shader,
      uniforms: uniforms,
      visible: true,
      transparent: true,
      side: THREE.DoubleSide,
      extensions: {derivatives: true},
    });
  this.screengeo = new THREE.PlaneBufferGeometry(1,1);
  this.screen = new THREE.Mesh(this.screengeo,this.material);
  this.screen.position.x = 0.5;
  this.scene.add(this.screen);

  this.wavefronts = new THREE.Group();
  this.linematerial = new THREE.LineMaterial( {color: 0x00ff00, linewidth:2, dashed: false });
  this.wavefront_geo = new THREE.LineGeometry();
  this.wavefront_geo.setPositions([0,-0.5,10, 0,0.5,10]);
  this.scene.add(this.wavefronts);

  this.scatterfronts = new THREE.Group();
  this.scattermaterial = new THREE.LineMaterial( {color: 0x00ff00, linewidth:1, dashed: true });
  this.circle_geo = new THREE.LineGeometry();
  var pts=[]; 
  var npts = 100;
  for(var i=0;i<=npts;i++) {
    pts.push( Math.sin(2*Math.PI*i/npts), Math.cos(2*Math.PI*i/npts),2);
  }
  this.circle_geo.setPositions(pts);
  this.scene.add(this.scatterfronts);


  this.SetAtomPositions();
  this.UpdateUniforms()




  $("#ctl-animate").on("change",function(){
    self.animating = $(this).is(":checked");
    console.error("animate toggle",self.animating);
    self.last_frame_t = Date.now();
    if(self.animating) self.AnimationRender();
  })

   $("#ctl-wavelength").on("change",function(){
    self.wavelength =parseFloat($(this).val())/1000;
  	self.v = self.wavelength/self.period;
    $('#show-wavelength').text(self.wavelength*1000);
    self.UpdateUniforms();
  })
   $("#ctl-period").on("change",function(){
    self.period =parseFloat($(this).val());
    self.v = self.wavelength/self.period;
    $('#show-period').text(self.period);
    self.UpdateUniforms();
  })
  $("#ctl-width").on("change",function(){
    var w  =parseFloat($(this).val());
    self.ymin = 0.5-w/2;
    self.ymax = 0.5+w/2;
    $('#show-width').text((self.ymax-self.ymin).toFixed(1));
    self.UpdateUniforms();
  })

   $("#ctl-phase").on("change",function(){
   	  self.phase_deg = parseFloat($("#ctl-phase").val());
	    $('#show-phase').html(self.phase_deg + "&deg;");
      self.phase = ((self.phase_deg)%360)/180*Math.PI;
    	console.error("new phase",self.phase);
     self.UpdateUniforms();
   })

   $('#ctl-primary').on("change",function(){
       self.show_primary = $(this).is(":checked")?1:0;
       self.UpdateUniforms();
   });


   $('#ctl-primary-wavefront').on("change",function(){
       var onf = $(this).is(":checked");
       self.wavefronts.visible = onf;
       if(!this.animating) self.AnimationRender();
   });
   $('#ctl-scatter-wavefront').on("change",function(){
       var onf = $(this).is(":checked");
       self.scatterfronts.visible = onf;
       if(!this.animating) self.AnimationRender();
   });
   $('#ctl-rescatter').on("change",function(){
       var onf = $(this).is(":checked");
       self.do_rescatter = onf?1:0;
       self.UpdateUniforms();
   });


   $("#ctl-reset").on("click",function(){
      self.t_ms = 0;
      if(!self.animating) $("#ctl-animate").click();
  })


   $('#ctl-natoms').on('change',this.SetAtomPositions.bind(this));
   $('#ctl-atom-layout').on('change',this.SetAtomPositions.bind(this));

  this.Resize();
  $(window).on("resize",this.Resize.bind(this));


  // this.DoFrame()

  this.AnimationRender();
}



Applet.prototype.Resize = function()
{
  this.width = $(this.element).width();
  this.height = $(this.element).height(); 

  this.renderer.setSize(this.width,this.height);
  this.resolution = new THREE.Vector2(this.width,this.height);
  this.renderer.setPixelRatio( window.devicePixelRatio );  
  this.renderer.setSize(this.width,this.height);
  this.aspect = this.height/this.width;
  this.camera.bottom = -0.5*this.aspect;
  this.camera.top = 0.5*this.aspect;
  this.camera.updateProjectionMatrix();

  this.linematerial.resolution = this.resolution;
  this.scattermaterial.resolution = this.resolution;
  console.log("Resize",this.width,this.height);
}

Applet.prototype.UpdateUniforms = function()
{
  var atoms_unrolled = [];
  for( atom of this.atoms ) { atoms_unrolled.push(atom[0], atom[1]); };
  this.material.uniforms.amp.value = this.amp;
  this.material.uniforms.tstop.value = this.tstop;
  this.material.uniforms.wavelength.value = this.wavelength;
  this.material.uniforms.period.value = this.period;
  this.material.uniforms.velocity.value = this.wavelength/this.period;
  this.material.uniforms.phase.value = this.phase;
  this.material.uniforms.scatteramp.value = this.scatteramp;
  this.material.uniforms.ymin.value = this.ymin;
  this.material.uniforms.ymax.value = this.ymax;
  this.material.uniforms.show_primary.value = this.show_primary;
  this.material.uniforms.do_rescatter.value = this.do_rescatter;
  if(!this.animating) this.AnimationRender();
}


Applet.prototype.AnimationRender = function()
{
  var now = Date.now();
  var frame_ms =  (now-this.last_frame_t);
  if(frame_ms > 300) frame_ms = 300;

  if(this.animating) this.t_ms += frame_ms;
  // if(this.t_ms > 300) this.t_ms = 300;
  this.last_frame_t = now; 
  var t = this.t_ms/1000;

  this.material.uniforms.t.value = t;

  this.SetPlaneWaveFronts(t);
  this.SetScatterFronts(t);

  this.renderer.render( this.scene, this.camera );
  console.log("render");
  if(this.animating)
    requestAnimationFrame(this.AnimationRender.bind(this));//  this.AnimationRender(); // starts anima
}

Applet.prototype.SetPlaneWaveFronts = function(t)
{
 
  // How many do we need?
  var nlines =1./this.wavelength; // Screen is width 1, so this many wavelengths fit.
  while(this.wavefronts.children.length < nlines) {
    var line = new THREE.Line2(this.wavefront_geo, this.linematerial);
    this.wavefronts.add(line);
  }

  // too many?
  while(this.wavefronts.children.length > nlines) {
    var line = this.wavefronts.children[0];
    this.wavefronts.remove(line);
  }

  // position of the first one:
  var x = (this.v*t-this.wavelength*0.25)%(this.wavelength);
  for(line of this.wavefronts.children) {
    line.position.x = x;
    line.visible=true;
    var reduced_time = (t-x/this.v);
    if(reduced_time < 0 || reduced_time > this.tstop) line.visible=false; 
    // if(x-this.v*t > 0) line.visible=false;

    x+=this.wavelength;
  }
}

Applet.prototype.SetScatterFronts = function(t)
{
 
  // How many do we need?
  while(this.scatterfronts.children.length < this.atoms.length) {
    var line = new THREE.Line2(this.circle_geo, this.scattermaterial);  
    this.scatterfronts.add(line);
    line.visible=false;
  }
  // too many?
  while(this.scatterfronts.children.length > this.atoms.length) {
    var line = this.scatterfronts.children[0];
    this.scatterfronts.remove(line);
  }

  for(var i=0;i<this.atoms.length;i++){
    var line = this.scatterfronts.children[i];
    var atom = this.atoms[i];
    if(atom[1]<this.ymin || atom[1]>this.ymax) {line.visible=false; continue;}
    line.position.x = atom[0];
    line.position.y = atom[1]-0.5;

    // reduced time; time since the first wavefront passed this spot.
    var tx =(t-this.wavelength*0.25/this.v-atom[0]/this.v + this.phase/(2*Math.PI)*this.period);
    if(tx<0 || tx > this.tstop) line.visible=false;
    else line.visible =true;
    var r = (this.v * tx) % this.wavelength; // look at the smallest of the rings.
    line.scale.x = r;
    line.scale.y = r;


  }
}

Applet.prototype.SetAtomPositions = function()
{
  this.atoms = [];

  this.natoms =  $('#ctl-natoms').val();
  var layout =    $('#ctl-atom-layout').find(':selected').val();

  // bounds:
  var xmin = 0.35;
  var xmax = 0.75;
  var ymin = this.ymin;
  var ymax = this.ymax;
  var angle = 30/180*Math.PI;

  if(layout.startsWith('a')) {
    ymin = (this.ymin-0.5)/Math.sin(angle) + 0.5;
    ymax = (this.ymax-0.5)/Math.cos(angle) + 0.5+0.2;

  }
  var xr = xmax - xmin;
  var yr = ymax - ymin;

  if(layout.includes("grid")) {
    var cols = Math.floor(Math.sqrt(this.natoms));
    var rows = Math.ceil(this.natoms / cols);
    var n = 0;
    for(var ix = 0; ix< cols; ix++) {
      for(var iy = 0; iy<rows; iy++) {
          var x = ((ix/(cols-1))*xr + xmin);
          var y = ((iy/(rows-1))*yr + ymin);
          if(n<this.natoms) {
              this.atoms.push([x,y]);
              n++;
          }
      }      
    }
  }
  else if(layout.includes("random")){
    while(this.atoms.length < this.natoms) {
      var x = Math.random();
      var y = Math.random();
      // if(y>x) continue;
      if(y<ymin) continue;
      if(y>ymax) continue;
      if(x<xmin) continue;
      if(x>xmax) continue;
      this.atoms.push([x,y]);
      // this.atoms.push( [Math.random()*this.width/2+this.width/4, Math.random()*this.height/2+this.height/4]);
    }    
  }

  if(layout.startsWith('a')) {
    // rotate.
    for(var atom of this.atoms) {
      var x = atom[0]-0.5;
      var y = atom[1]-0.5;
      atom[0] =  x*Math.cos(angle) + y*Math.sin(angle) + 0.5;
      atom[1] = -x*Math.sin(angle) + y*Math.cos(angle) + 0.5;
    }
  }

  if(this.natoms==0) this.atoms=[[0,0]];


  console.log("laying out ",this.natoms,"layout",layout);

  $('#show-natoms').text(parseInt(this.natoms));
  // tell the texture.
  var atoms_unrolled = [];
  for( atom of this.atoms ) { atoms_unrolled.push(atom[0], atom[1]); };
  this.material.uniforms.natoms.value = this.atoms.length;
  this.material.uniforms.atoms.value = atoms_unrolled;
  if(!this.animating) this.AnimationRender();

}


