
$(function(){
  applet = new Applet($('div#sim'));
});


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
  $(this.element).css("height",this.width);
  this.height = this.width;
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

  // Offscreen buffer
  this.bufferTextures = []
  for(i=0;i<3;i++)
      this.bufferTextures.push(
        new THREE.WebGLRenderTarget(this.width,this.height, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,wrapS:THREE.ClampToEdgeWrapping, wrapT:THREE.ClampToEdgeWrapping}) 
      );


   // Offscreen buffers for oscillators
  this.oscBufferTextures = []
  for(i=0;i<3;i++)
      this.oscBufferTextures.push(
        new THREE.WebGLRenderTarget(this.width,this.height, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,wrapS:THREE.ClampToEdgeWrapping, wrapT:THREE.ClampToEdgeWrapping}) 
      );

  this.frame_number = 0;


  // This is an identical mesh used to render to buffer:
  console.log("Constructing field simulation material");
  this.bufferScene = new THREE.Scene();

  var sim_uniforms = {
    tex_o2:  { type: "t", value: this.oscBufferTextures[0] },
    tex_o1:  { type: "t", value: this.oscBufferTextures[1] },
    tex_t2:  { type: "t", value: this.bufferTextures[0] },
    tex_t1:  { type: "t", value: this.bufferTextures[1] },
    width:   {type: "f", value: this.width},
    height:  {type: "f", value: this.height},
    c:       {type: "f", value: 0},
    plane_wave_frequency: {type: "f", value: 0.1},
    plane_wave_amplitude: {type: "f", value: 1.0},
    field_coupling: {type: "f", value: 1.0},
    clear_flag:   {type: "f", value: 0},
    t:         { type: "f", value: 0},    
  }

 this.sim_material = new THREE.RawShaderMaterial( {
      vertexShader:   vertex_shader,
      fragmentShader: sim_fragment_shader,
      uniforms: sim_uniforms,
      visible: true,
      transparent: false,
      side: THREE.DoubleSide,
  });

  this.bufferscreengeo = new THREE.PlaneBufferGeometry(1,1);

  this.bufferscreen = new THREE.Mesh(this.bufferscreengeo,this.sim_material);
  this.bufferscreen.position.x = 0.5;
  this.bufferScene.add(this.bufferscreen);






  // This is an identical mesh used to render to buffer:
  console.log("Constructing oscillator simulation material");

  this.oscBufferScene = new THREE.Scene();


  var osc_uniforms = {
    tex_o2:  { type: "t", value: this.oscBufferTextures[0] },
    tex_o1:  { type: "t", value: this.oscBufferTextures[1] },
    tex_t1:  { type: "t", value: this.bufferTextures[0] },
    tex_t2:  { type: "t", value: this.bufferTextures[0] },
    osc_density: { type: "t", value: 0.001 }, // fraction of pixels with an oscillator
    w0:   {type: "f", value: 0.11}, // resonating frequency, in rad/frame
    beta:  {type: "f", value: 0.01}, // damping factor
    x0: {type:"f", value: 0}, // starting value for the ocillators
    clear_flag:   {type: "f", value: 0},
  }

  this.osc_material = new THREE.RawShaderMaterial( {
      vertexShader:   vertex_shader,
      fragmentShader: resonator_fragment_shader,
      uniforms: osc_uniforms,
      visible: true,
      transparent: false,
      side: THREE.DoubleSide,
  });

  this.oscBufferscreengeo = new THREE.PlaneBufferGeometry(1,1);

  this.oscBufferscreen = new THREE.Mesh(this.oscBufferscreengeo,this.osc_material);
  this.oscBufferscreen.position.x = 0.5;
  this.oscBufferScene.add(this.oscBufferscreen);




  console.log("Constructing display material");

  var disp_uniforms = {
    tex: { type: "t", value: this.bufferTextures[2] },
  };

 
  this.disp_material = new THREE.RawShaderMaterial( {
      vertexShader:   vertex_shader,
      fragmentShader: disp_fragment_shader,
      uniforms: disp_uniforms,
      visible: true,
      transparent: true,
      side: THREE.DoubleSide,
    });

  // This is the mesh used to render to the screen:
  this.screengeo = new THREE.PlaneBufferGeometry(1,1);
  this.screen = new THREE.Mesh(this.screengeo,this.disp_material);
  this.screen.position.x = 0.5;
  this.scene.add(this.screen);

  
  this.wavefronts = new THREE.Group();
  this.linematerial = new THREE.LineMaterial( {color: 0x00ff00, linewidth:0.9, dashed: false });
  this.wavefront_geo = new THREE.LineGeometry();
  this.wavefront_geo.setPositions([0,-0.5,1, 0,0.5,1]);
  this.scene.add(this.wavefronts);

  // this.scatterfronts = new THREE.Group();
  // this.scattermaterial = new THREE.LineMaterial( {color: 0x00ff00, linewidth:1, dashed: true });
  // this.circle_geo = new THREE.LineGeometry();
  // var pts=[]; 
  // var npts = 1;
  // for(var i=0;i<=npts;i++) {
  //   pts.push( Math.sin(2*Math.PI*i/npts), Math.cos(2*Math.PI*i/npts),2);
  // }
  // this.circle_geo.setPositions(pts);
  // this.scene.add(this.scatterfronts);


  this.UpdateUniforms()




  $("#ctl-animate").on("change",function(){
    self.animating = $(this).is(":checked");
    console.error("animate toggle",self.animating);
    self.last_frame_t = Date.now();
    if(self.animating) self.AnimationRender();
  })
  $("#ctl-primary-wavefront").on("change",function(){
      self.wavefronts.visible = $('#ctl-primary-wavefront').is(":checked");

  })


  $("input[type='range']").on("change",this.UpdateUniforms.bind(this));


   $("#ctl-reset").on("click",function(){
      self.t_ms = 0;
      self.frame_number=0;
      if(!self.animating) $("#ctl-animate").click();
  })


   // $('#ctl-natoms').on('change',this.SetAtomPositions.bind(this));
   // $('#ctl-atom-layout').on('change',this.SetAtomPositions.bind(this));

  this.Resize();
  $(window).on("resize",this.Resize.bind(this));


  // this.DoFrame()


  // // zero the animation frames.
  // this.disp_material = new THREE.ShaderMaterial( {
  //     vertexShader:   vertex_shader,
  //     fragmentShader: zero_fragment_shader,
  //     uniforms: {
  //       tex: { type: "t", value: bufferTexture1 },
  //     },
  //     visible: true,
  //     transparent: false,
  //     side: THREE.DoubleSide,
  //   });


  this.wavefronts.visible = $('#ctl-primary-wavefront').is(":checked");
  this.AnimationRender();

  // this.scatterfronts.visible = $('#ctl-scatter-wavefront').is("checked");

}



Applet.prototype.Resize = function()
{
  this.width = $(this.element).width();
  this.height = this.width;
  $(this.element).css('height',this.height);
  // this.height = $(this.element).height(); 

  this.renderer.setSize(this.width,this.height);
  this.resolution = new THREE.Vector2(this.width,this.height);
  this.renderer.setPixelRatio( window.devicePixelRatio );  
  this.renderer.setSize(this.width,this.height);
  this.aspect = this.height/this.width;
  this.camera.bottom = -0.5*this.aspect;
  this.camera.top = 0.5*this.aspect;
  this.camera.updateProjectionMatrix();

  this.linematerial.resolution = this.resolution;
  //this.scattermaterial.resolution = this.resolution;
  console.log("Resize",this.width,this.height);
}

Applet.prototype.UpdateUniforms = function()
{
  this.sim_material.uniforms.c.value                    = $("#ctl-speed").val();
  this.sim_material.uniforms.plane_wave_frequency.value = $("#ctl-frequency").val();
  this.sim_material.uniforms.plane_wave_amplitude.value = $("#ctl-amplitude").val();
  this.sim_material.uniforms.field_coupling.value       = $("#ctl-field-coupling").val();
  
  this.osc_material.uniforms.osc_density.value          = $("#ctl-density").val();
  this.osc_material.uniforms.w0.value                   = $("#ctl-w0").val();
  this.osc_material.uniforms.beta.value                 = $("#ctl-beta").val();
  this.osc_material.uniforms.x0.value                   = $("#ctl-x0").val(); 

  for(l of ["speed","frequency","amplitude","field-coupling","density","w0","beta","x0"]){
    $('#show-'+l).text($('#ctl-'+l).val());
  }
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


  // speed of wave in pixels/frame
  // this.sim_material.uniforms.c.value = 0.4;
  this.sim_material.uniforms.width.value = this.width;
  this.sim_material.uniforms.height.value = this.height;


  // simulate.

  // Set the buffer rotation. 
  // second
  this.frame_number++; // advance the frane number
  if(this.frame_number<4) {
    this.sim_material.uniforms.clear_flag.value = 1.0;//(this.frame<5)?1:0;
    this.osc_material.uniforms.clear_flag.value = 1.0;//(this.frame<5)?1:0;
  } else {
    this.sim_material.uniforms.clear_flag.value = 0;//(this.frame<5)?1:0;
    this.osc_material.uniforms.clear_flag.value = 0;//(this.frame<5)?1:0;
  }

  var f0 = (this.frame_number%3);
  var f1 = (this.frame_number+1)%3;
  var f2 = (this.frame_number+2)%3;

  var render_to_buffer_no = (this.frame_number+2)%3

  // console.log("render to oscillators buffer");
  this.osc_material.uniforms.tex_o1.value = this.oscBufferTextures[f0].texture;      // oldest frame
  this.osc_material.uniforms.tex_o2.value = this.oscBufferTextures[f1].texture; // most recent frame
  this.osc_material.uniforms.tex_t2.value = this.bufferTextures[f2].texture;      // most recent field frame
  this.osc_material.uniforms.tex_t2.value = this.bufferTextures[f1].texture;      // most recent field frame

  this.renderer.setRenderTarget(this.oscBufferTextures[f2]);
  this.renderer.render(this.oscBufferScene, this.camera);



  this.sim_material.uniforms.tex_o2.value = this.oscBufferTextures[f1].texture;     // most recent frame
  this.sim_material.uniforms.tex_o1.value = this.oscBufferTextures[f0].texture;     // most recent frame
  this.sim_material.uniforms.tex_t1.value = this.bufferTextures[f0].texture;      // oldest frame
  this.sim_material.uniforms.tex_t2.value = this.bufferTextures[f1].texture; // most recent frame
  //var render_to_buffer = this.bufferTextures[(this.frame_number+2)%3];                 // frame we're rendering into.

  this.sim_material.uniforms.t.value = this.frame_number; // most recent frame
  
  // console.log('render t=',t,'frame =',this.frame_number);

  // console.log("render to simulation buffer");
  this.renderer.setRenderTarget(this.bufferTextures[render_to_buffer_no]);
  this.renderer.render(this.bufferScene, this.camera);





  // Now map the output to the screen:
  if($('#ctl-osc').is(":checked"))
   this.disp_material.uniforms.tex.value = this.bufferTextures[render_to_buffer_no].texture;
  else
   this.disp_material.uniforms.tex.value = this.oscBufferTextures[render_to_buffer_no].texture;

  // pull values from specific pixels.
  var gl = this.renderer.getContext();
  var data = new Uint8Array(4*20*20);
  // console.log(gl);
  // gl.readPixels(this.atoms[0][0]*gl.drawingBufferWidth-100
  //              ,this.atoms[0][1]*gl.drawingBufferHeight-100
  //              ,200,200,gl.RGBA,gl.UNSIGNED_BYTE,data);

  // gl.readPixels(Math.floor(this.width*this.atoms[0][0])-1,Math.floor(this.height*this.atoms[0][1])-1,10,10,gl.RGBA,gl.UNSIGNED_BYTE,data);
  for(var i=0;i<data.length/4;i++) { 
    // if(decodeValue(data,i*4)>0.01) console.error("HIT",i,decodeValue(data,i*4)) 

  }
  // console.log("psi",psi,"pixeldata",data,"decoded",decodeValue(data));


  // Now we can render the scene to screen:
  // console.log("render to screen");
  this.renderer.setRenderTarget(null);
  this.renderer.render( this.scene, this.camera );


  this.SetPlaneWaveFronts(t);
  // this.SetScatterFronts(t);

  this.renderer.render( this.scene, this.camera );
  // console.log("render");
  if(this.animating)
    requestAnimationFrame(this.AnimationRender.bind(this));//  this.AnimationRender(); // starts anima
}


function decodeValue(rgb,offset)
{
  offset = offset || 0
  return (rgb[0+offset]/255.0 + rgb[1+offset]/65025.0 + rgb[2+offset]/16581375.0)*2.0-1.0;
}


Applet.prototype.SetPlaneWaveFronts = function()
{
  var t = this.frame_number;
  var c = this.sim_material.uniforms.c.value;                             // pixels per frame
  var frequency = this.sim_material.uniforms.plane_wave_frequency.value;  // rad per frame
  var wavelength_p = c/frequency;         // in pixels
  var wavelength = wavelength_p / this.width; // in THREE.js coordinates.

  var start_x = 0.05; // must match renderer

  // Speed in screen units per frame
  var v = c/this.width;

  // Move all existing lines one step forward.
  for(line of this.wavefronts.children) {
    line.position.x += v;
  }

  for(i = this.wavefronts.children.length-1; i>=0; i--) {
    var line = this.wavefronts.children[i];
    if(line.position.x > 1.0) this.wavefronts.remove(line);
  }


  // position of the first one:
  var wt = frequency*t - start_x/wavelength  + 10*Math.PI;
  var wt1 = frequency*(t+1) - start_x/wavelength  + 10*Math.PI;
  if( (wt%(2*Math.PI))>=(Math.PI/2)  &&  (wt1%(2*Math.PI))<(Math.PI/2) ) {
    // Time to start a new one.
    console.log("adding wavefront",t,wt,(wt%(2*Math.PI)),(wt1%(2*Math.PI)));
    var line = new THREE.Line2(this.wavefront_geo, this.linematerial);
    line.position.x = start_x;
    line.visible=true;
    this.wavefronts.add(line);
  }

  // for(line of this.wavefronts.children) {
  //   console.log(line.position.x);
  // }

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



