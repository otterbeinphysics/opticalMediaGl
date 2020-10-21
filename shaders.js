
var vertex_shader = `
precision highp float;
precision highp int;
uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
 uniform mat3 normalMatrix;
 uniform vec3 cameraPosition;
 attribute vec3 position;
 attribute vec3 normal;
 attribute vec2 uv;
varying vec2 vUv;

   void main() {
       vUv = uv;
       vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );

      vec3 vPosition = (modelMatrix *
           vec4(position,1.0)).xyz;
       gl_Position = projectionMatrix * mvPosition;
      // vec3 transformedNormal = normalMatrix *  vec3( normal );
      // vNormal = normalize( transformedNormal );
      // vViewDirection = normalize(mvPosition.xyz);
  }
  `
;



// This is the now-obsolete version that encodes fixed-point values as simple fractions.
// Limitation: requires all field values to be less than 1.0 in these units.  Awkward.
// var shader_includes_old = `
// precision mediump float;

// const vec3 decodeVec = vec3(1.0, 1.0/255.0, 1.0/65025.0);
// const vec3 encodeVec = vec3(1.0, 255.0, 65025.0);
// float kEncodeBit = 1.0/255.0;

// float decodeValue(vec3 v)
// {
//   return dot(v,decodeVec)*2.0-1.0;
// }
// vec3 encodeValue(float f)
// {
//   vec3 enc = encodeVec * ((f+1.0)*0.5);  // Turn into 0-1, then multiply by encode vector.
//   enc = fract(enc); // fractional part.
//   enc.x -= enc.y * kEncodeBit;
//   enc.y -= enc.z * kEncodeBit;
//   return enc;
// }
// `;

///////////////////////////////////////
// This is the version that encodes floating-point values.

// Javascript test code to make sure theory is sound:
// function encode(f)
// {
//   // Return three bytes of data as packed floating point representation
//   var exponent = Math.floor(Math.log2(Math.abs(f)))+1;
//   // clamp
//   var coded_exponent = exponent+128;
//   if(coded_exponent<0) coded_exponent = 0;
//   if(coded_exponent>255) coded_exponent = 255;
//   var divisor = 1<<exponent;
//   var fraction = f/divisor; // Value between -1 and 1.  "Mantissa"
//   var normfrac = (fraction/2.) + 0.5;  // Value between 0 and 1
//   var high = Math.floor(255*normfrac);
//   var low  = Math.floor((normfrac-high/255.)*65025);
//   return[high,low,coded_exponent];
// }

// function decode(vec)
// {
//   var exponent = vec[2] -128;
//   var divisor = 1<<exponent;
//   var f = vec[0]/255;
//   f += vec[1] / 65025;
//   var signed = (f-0.5)*2.0;
//   return signed * divisor;
// }


function encode(f)
{
  // Return three bytes of data as packed floating point representation
  var exponent = Math.floor(Math.log2(Math.abs(f)))+1;
  if(f==0) exponent = -128;
  // clamp
  var coded_exponent = exponent+128;
  if(coded_exponent<0) coded_exponent = 0;
  if(coded_exponent>255) coded_exponent = 255;
  var divisor =  Math.pow(2,exponent);
  var fraction = f/divisor; // Value between -1 and 1.  "Mantissa"
  var normfrac = (fraction/2.) + 0.5;  // Value between 0 and 1
  var high = Math.floor(256*normfrac);
  var low  = Math.floor((normfrac-high/256.)*65536);
  var report = {exponent,divisor,fraction,normfrac,high,low,coded_exponent};
  // console.log(JSON.stringify(report,null,2));
  return[high,low,coded_exponent];
}

function decode(vec)
{
  if(vec[2]==0) return 0;

  var exponent = vec[2] -128;
  var divisor = Math.pow(2,exponent);
  var f = vec[0]/256;
  f += vec[1] / 65536;
  var signed = (f-0.5)*2.0;
  return signed * divisor;
}

function test_encoder_decoder()
{
  for(var i=0;i<10;i++) {
    var f = 1e3 * (Math.random()-0.5);
    var enc = encode(f);
    var dec = decode(enc);
    console.log(f,enc,dec);
  }
}



var shader_includes = `
precision mediump float;

// Encode a floating point value as 3 byte-sized floats as an output vec3 rgb
vec3 encodeValue(float f)
{
  float exponent = floor(log2(abs(f)))+1.0;
  if(f==0.0) exponent = -128.0;
  float coded_exponent = (exponent+128.0)/255.0;
  float divisor = exp2(exponent);
  float fraction = f/divisor;

  // float fraction = f;

  float normfrac = (fraction/2.0)+0.5;
  float high = floor(255.*normfrac)/255.;
  float low = (normfrac-high)*255.0;
  
  
  vec3 enc;
  enc.x = high;
  enc.y = low;
  enc.z = coded_exponent;

  return enc;
}

// Decode a vec3 rgb into a floating-point number.
float decodeValue(vec3 v)
{
  if(v.z==0.0) return 0.;
  float exponent = (v.z*255.0)-128.0;
  float divisor = exp2(exponent);
  // divisor = 1.0;
  float f = v.x;
  f+= v.y/255.0;
  float signed = (f-0.5)*2.0;
  return signed*divisor;
}
`

// The physical model is this:
// Massless rubber sheet in zero-g under tension
// at some specific points, a mass is attached by a spring to the sheet (with optional damping)

//
// Field simulation
// d2 psi/dt2 = Grad(psi) + c^2 + driving terms from oscillators
//

var sim_fragment_shader = shader_includes+`
#define PI 3.1415926535897932384626433832795
#define MAX_ATOMS 100

precision mediump float;

  varying vec2 vUv;
  // varying vec3 vPosition;
  // varying vec3 vNormal;
  // varying vec3 vViewDirection;

uniform float clear_flag; 
uniform float c;  // speed of wave, in pixels per frame
uniform float width;  // size of input textures, in pixels
uniform float height;
uniform sampler2D tex_t2; // Most recent frame
uniform sampler2D tex_t1; // Second most recent frame.
uniform sampler2D tex_o2; // Most recent frame containing oscillator data
// uniform sampler2D tex_o1; // Second most recent frame.
uniform float t; // For wave generation

uniform float plane_wave_frequency; // In rad/s, uses 't'
uniform float plane_wave_amplitude; // In rad/s, uses 't'
uniform float field_coupling;
uniform float do_velocity; // Flag. 0 = position map, 1 = report velocity map

precision mediump float;

const float border = 0.04; // damp if this close to the edge (in screen fraction)
const float dt = 1.0;

void main() {
  // find the input texture values
  // vUv is the normalized U,V coordinate in the object which nominally
  // maps to inputtexture(u,v).  However, we're going to manipulate it:
  float newpsi =0.0;
  float newpsidot =0.0;

  if(vUv.x<0.05 && vUv.x>=0.04 && vUv.y>0.25 && vUv.y<0.75) {
        // Plane wave creator
        // newpsi = plane_wave_amplitude* cos(t* plane_wave_frequency);
        float r = (vUv.y-0.5);
        float beam_profile = exp(-r*r/0.05);
        newpsi = plane_wave_amplitude*beam_profile* cos(t* plane_wave_frequency);
        
  
  } else {

        // find the last two samples at THIS position.
        float psi = decodeValue(texture2D(tex_t2,vUv).xyz);
        float psi_last = decodeValue(texture2D(tex_t1,vUv).xyz);
        float psidot = psi - psi_last;

        // Find the values left, right, top, bottom in most recent texture.
        vec2 pixel = vec2(1.0/width,1.0/height);
        vec2 vleft = vec2(vUv.x - pixel.x, vUv.y);
        vec2 vright = vec2(vUv.x + pixel.x, vUv.y);
        vec2 vbelow = vec2(vUv.x, vUv.y - pixel.y);
        vec2 vabove = vec2(vUv.x, vUv.y + pixel.y);

        vec2 v_NE = vec2(vUv.x + pixel.x, vUv.y + pixel.y);
        vec2 v_NW = vec2(vUv.x - pixel.x, vUv.y + pixel.y);
        vec2 v_SE = vec2(vUv.x + pixel.x, vUv.y - pixel.y);
        vec2 v_SW = vec2(vUv.x - pixel.x, vUv.y - pixel.y);
        
        float psi_left  = decodeValue(texture2D(tex_t2,vleft).xyz);
        float psi_right = decodeValue(texture2D(tex_t2,vright).xyz);
        float psi_below = decodeValue(texture2D(tex_t2,vbelow).xyz);
        float psi_above = decodeValue(texture2D(tex_t2,vabove).xyz);
        // float psi_NE = decodeValue(texture2D(tex_t2,v_NE).xyz);
        // float psi_NW = decodeValue(texture2D(tex_t2,v_NW).xyz);
        // float psi_SE = decodeValue(texture2D(tex_t2,v_SE).xyz);
        // float psi_SW = decodeValue(texture2D(tex_t2,v_SW).xyz);

        // https://en.wikipedia.org/wiki/Discrete_Laplace_operator has basically a filter kernel to do this.
        // float laplacian = 0.5*(psi_left + psi_right + psi_below + psi_above )
        //                 + 0.25*(psi_NE + psi_NW + psi_SE + psi_SW)
        //                 - psi*3.0;

        //float laplacian = (psi_right-psi)-(psi-psi_left) + (psi_below-psi)-(psi-psi_above);
        float laplacian = psi_left + psi_right + psi_below + psi_above
                        - psi*4.0;

        float psidoubledot = laplacian * c * c  - 0.00001*psi; // very mild restoring force.


        // Damp down oscillations near the border of the window to prevent reflections.
        float edgex = min(vUv.x,1.0-vUv.x);
        float edgey = min(vUv.y,1.0-vUv.y);
        float edge = min(edgex,edgey);
        float damp = smoothstep(0.0,border,edge);

        // very very mild restoring force
        // damp += 0.001;

        psidoubledot -= psidot*(1.0-damp)*0.2;


        // oscillator pushes on field by difference in field height and oscillator height
        vec4 osc_raw = texture2D(tex_o2,vUv);
        float x;
        if(osc_raw.a > 0.5 && edge>border) {
          x = decodeValue(osc_raw.xyz);
          psidoubledot += field_coupling*(x-psi);
        }

        newpsidot = psidot + dt*psidoubledot;
        newpsi = psi + dt*newpsidot;

        if(clear_flag > 0.0) newpsi=0.0;
  }


  if(do_velocity>0.5)    gl_FragColor.xyz = encodeValue(newpsidot);
  else                   gl_FragColor.xyz = encodeValue(newpsi);


  // gl_FragColor.xyz = encodeValue(newpsi);
  gl_FragColor.a = 1.0;
  
} 
`;



//
// Resonating oscillator simulation.
// d^2 x/dt^2 = -w0^2(x-psi) - beta dx/dt 
//



var resonator_fragment_shader = shader_includes+`
#define PI 3.1415926535897932384626433832795
#define MAX_ATOMS 100

precision mediump float;

varying vec2 vUv;

uniform float osc_density;  //oscilators per pixel
uniform float w0; // resonating frequency, in rad/frame
uniform float beta; // damping factor
uniform float x0; // starting value;

uniform sampler2D tex_t2; // Most recent contianing the field values
uniform sampler2D tex_o2; // Most recent frame containing oscillator data
uniform sampler2D tex_o1; // Second most recent frame
uniform float clear_flag; 
uniform float t; 
uniform float do_velocity; // Flag. 0 = position map, 1 = report velocity map

float dt = 1.0;

float random (vec2 st) {
    return fract(sin(dot(st.xy,
                  vec2(12.9898,78.233)))*
                  43758.5453123);
}

void main() {
  // is the current pixel active? look at the alpha channel to see.
  // if(clear_flag>0.0) {

  //   // Find a few random spots to make opaque. Set to a large value for testing.
  //   if( (vUv.x>0.4) && (random(vUv)>1.0-osc_density)) {
  //         gl_FragColor.a = 1.0;
  //         gl_FragColor.xyz = encodeValue(x0);
  //   } else {
  //         gl_FragColor.a = 0.0;
  //         gl_FragColor.xyz = encodeValue(0.0);
  //   }

  // } else {


    vec4 rgba_n_2 = texture2D(tex_o2,vUv);
    if(rgba_n_2.a == 0.0) {
      // no resonanator here
      // gl_FragColor.xyz = encodeValue(0.0);
      // gl_FragColor.a = 0.;
      gl_FragColor=vec4(0.0, 0.0, 0.0, 0.0);

      return;
    }

    // gl_FragColor.xyz = encodeValue(0.0);
    // gl_FragColor.a = 1.;
    // return;
    vec4 rgba_n_1 = texture2D(tex_o1,vUv);

    float x1 = decodeValue(rgba_n_1.xyz);
    float x2 = decodeValue(rgba_n_2.xyz);
    // float E1 = decodeValue(texture2D(tex_t1,vUv).xyz);
    float psi = decodeValue(texture2D(tex_t2,vUv).xyz);

    float xdot = (x2-x1)/dt;
    // force on an oscillator:
    float xddot = 
                w0*w0*(psi-x2) 
                // - w0*w0*x2
                - beta*xdot
                ;
    float new_xdot = xdot + xddot*dt;
    float new_x = x2 + new_xdot*dt;

    if(do_velocity>0.)    gl_FragColor.xyz = encodeValue(new_xdot);
    else                  gl_FragColor.xyz = encodeValue(new_xdot);
    gl_FragColor.a = rgba_n_1.a;

  }
// } 
`;



var disp_fragment_shader = shader_includes + `
#define PI 3.1415926535897932384626433832795

precision mediump float;

// set of textures in tdc dimention, consecutive.  The y-coordinate of all of these should be identical.

  varying vec2 vUv;
  // varying vec3 vPosition;
  // varying vec3 vNormal;
  // varying vec3 vViewDirection;

uniform sampler2D tex; 


void main() {
  // find the input texture values

  // float negToPos1 = vUv.x*2.0-1.0;
  // vec3 enc = encodeValue(negToPos1);
  // float psi = decodeValue(enc);
  // psi = negToPos1;


  vec4 raw = texture2D(tex,vUv);
  float psi = decodeValue(raw.xyz)/4.0;


  // gl_FragColor.rgb = mix(vec3(1.0,0.0,0.0),
  //                    vec3(0.0,1.0,0.0),
  //                    (psi+1.0)*0.5 );
  

  // gl_FragColor.a = 1.0;

  if(raw.a==0.0) {
   gl_FragColor = vec4( 1.0, 
                        1.0, 
                        1.0,
                        1.0);
 
  } else {
    gl_FragColor = vec4( psi/2.0 + 0.5, 
                        0.0, 
                        psi / 2.0 + 0.5, 
                        1.0);
  }               
  // gl_FragColor.rgb = vec3(0.,0.,raw.z*100.);
} 
`;



