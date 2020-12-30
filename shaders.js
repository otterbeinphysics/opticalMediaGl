
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


// Email DGR 10/20/20
// Okay, here is the 4th order RK for Newton’s second law. It assumes
 
// dx/dt = v
// dv/dt = a
 
// where a = a(x,v,t) is specified.
 
//     k1v = a(x[i-1], v[i-1], t[i-1])*dt
//     k1x = v[i-1]*dt
 
//     k2v = a(x[i-1] + k1x/2, v[i-1] + k1v/2, t[i-1] + dt/2)*dt
//     k2x = (v[i-1] + k1v/2)*dt
 
//     k3v = a(x[i-1] + k2x/2, v[i-1] + k2v/2, t[i-1] + dt/2)*dt
//     k3x = (v[i-1] + k2v/2)*dt
 
//     k4v = a(x[i-1] + k3x, v[i-1] + k3v, t[i-1] + dt)*dt
//     k4x = (v[i-1] + k3v)*dt
 
//     v[i] = v[i-1] + (k1v + 2*k2v + 2*k3v + k4v)/6
//     x[i] = x[i-1] + (k1x + 2*k2x + 2*k3x + k4x)/6
 
// The 2nd order version is:
 
//     k1v = a(x[i-1], v[i-1], t[i-1])*dt
//     k1x = v[i-1]*dt
//     k2v = a(x[i-1] + k1x/2, v[i-1] + k1v/2, t[i-1] + dt/2)*dt
//     k2x = (v[i-1] + k1v/2)*dt
//     v[i] = v[i-1] + k2v
//     x[i] = x[i-1] + k2x
 
// Enjoy!


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
uniform sampler2D tex_psi; // Most recent frame
uniform sampler2D tex_psidot; // Most recent velocity frame
// uniform sampler2D tex_psiddot; // Most recent acceleration frame
uniform sampler2D tex_osc; // Most recent frame containing oscillator data
uniform float beam_width;
uniform float t; // For wave generation

uniform float plane_wave_frequency; // In rad/s, uses 't'
uniform float plane_wave_amplitude; // In rad/s, uses 't'
uniform float field_coupling;
uniform int output_mode; // Flag. 0 = position map, 1 = report velocity map, 2 = report accel

precision mediump float;

const float border = 0.05; // damp if this close to the edge (in screen fraction)
const float dt = 1.0;

float calc_force(float psi, float psidot, float lsum, float damp, float dx_osc)
{
    // lsum is approximately the sum of the neghboring pixels
    // damp is a damping factor: 0 if no damping, 1 if next to edge
    // x_osc is the oscillator value if one is present. If not present, enter psi here.
    float laplacian = lsum - psi*3.0;
    float psidoubledot = laplacian * c * c  - 0.00001*psi; // very mild restoring force.
    psidoubledot -= psidot*(1.0-damp)*0.2;

    // oscillator pushes on field by difference in field height and oscillator height
    psidoubledot += field_coupling*(dx_osc);
    return psidoubledot;
}

void main() {
  // find the input texture values
  // vUv is the normalized U,V coordinate in the object which nominally
  // maps to inputtexture(u,v).  However, we're going to manipulate it:
  float newpsi =0.0;
  float newpsidot =0.0;
  float psidoubledot =0.0;

  if(clear_flag > 0.0) {
    gl_FragColor.xyz = encodeValue(0.0);
    gl_FragColor.a = 1.0;
    return;
  }

  // most recent value.
  float psi = decodeValue(texture2D(tex_psi,vUv).xyz);

  if(vUv.x<0.05 && vUv.x>=0.04 && vUv.y>0.25 && vUv.y<0.75) {
        // Plane wave creator
        // newpsi = plane_wave_amplitude* cos(t* plane_wave_frequency);
        float r = (vUv.y-0.5);
        float beam_profile = exp(-r*r/beam_width);
        newpsi = plane_wave_amplitude*beam_profile* sin(t* plane_wave_frequency);
        
  
  } else {

        float psi = decodeValue(texture2D(tex_psi,vUv).xyz);
        float psidot = decodeValue(texture2D(tex_psidot,vUv).xyz);

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
        
        float lsum = 0.0;
        lsum += 0.5* decodeValue(texture2D(tex_psi,vleft).xyz);
        lsum += 0.5* decodeValue(texture2D(tex_psi,vright).xyz);
        lsum += 0.5* decodeValue(texture2D(tex_psi,vbelow).xyz);
        lsum += 0.5* decodeValue(texture2D(tex_psi,vabove).xyz);
        lsum += 0.25*decodeValue(texture2D(tex_psi,v_NE).xyz);
        lsum += 0.25*decodeValue(texture2D(tex_psi,v_NW).xyz);
        lsum += 0.25*decodeValue(texture2D(tex_psi,v_SE).xyz);
        lsum += 0.25*decodeValue(texture2D(tex_psi,v_SW).xyz);

        // Damp down oscillations near the border of the window to prevent reflections.
        float edgex = min(vUv.x,1.0-vUv.x);
        float edgey = min(vUv.y,1.0-vUv.y);
        float edge = min(edgex,edgey);
        float damp = smoothstep(0.0,border,edge);

        // oscillator pushes on field by difference in field height and oscillator height
        float dx = 0.;
        vec4 osc_raw = texture2D(tex_osc,vUv);
        if(osc_raw.a > 0. && edge>border) {
          dx = decodeValue(osc_raw.xyz) - psi;
        }

        // Euler method:
        psidoubledot = calc_force(psi,psidot,lsum,damp,dx );
        newpsidot = psidot + dt*psidoubledot;
        newpsi = psi + dt*newpsidot;

        // // RK4 method:
        // float k1v = calc_force(psi,psidot,lsum,damp,dx)*dt;
        // float k1x = psidot * dt;

        // float k2v = calc_force(psi+k1x/2.,psidot+k1v/2.,lsum,damp,dx)*dt;
        // float k2x = (psidot + k1v/2.)*dt;

        // float k3v = calc_force(psi+k2x/2.,psidot+k2v/2.,lsum,damp,dx)*dt;
        // float k3x = (psidot + k2v/2.)*dt;

        // float k4v = calc_force(psi+k3x,psidot+k3v,lsum,damp,dx)*dt;
        // float k4x = (psidot + k3v)*dt;

        // newpsidot = psidot +(k1v + 2.*k2v + 2.*k3v + k4v)/6.;
        // newpsi    = psi    +(k1x + 2.*k2x + 2.*k3x + k4x)/6.;
  }



  gl_FragColor.a = 1.0;
  if(output_mode==0)      gl_FragColor.xyz = encodeValue(newpsi);
  else if(output_mode==1) gl_FragColor.xyz = encodeValue(newpsidot);
  else if(output_mode==2) gl_FragColor.xyz = encodeValue(psidoubledot);
  
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

uniform sampler2D tex_psi; // Most recent contianing the field values
uniform sampler2D tex_osc; // Most recent frame containing oscillator data
uniform sampler2D tex_oscdot; // Most recent frame containing oscillator velocities.
// uniform sampler2D tex_oscddot; // Most recent frame containing oscillator accelerations.
uniform float clear_flag; 
uniform float t; 
uniform int output_mode; // Flag. 0 = position map, 1 = report velocity map

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


    vec4 rgba_osc = texture2D(tex_osc,vUv);
    if(rgba_osc.a == 0.0) {
      // no resonanator here
      // gl_FragColor.xyz = encodeValue(0.0);
      // gl_FragColor.a = 0.;
      gl_FragColor=vec4(0.0, 0.0, 0.0, 0.0);

      return;
    }

    // gl_FragColor.xyz = encodeValue(0.0);
    // gl_FragColor.a = 1.;
    // return;

    float x= decodeValue(rgba_osc.xyz);
    // float xddot = decodeValue(texture2D(tex_oscddot,vUv).xyz);
    float xdot = decodeValue(texture2D(tex_oscdot,vUv).xyz);
    float psi  = decodeValue(texture2D(tex_psi,vUv).xyz);

    // Euler method:
    // // force on an oscillator:
    // float new_xddot = 
    //             w0*w0*(psi-x) 
    //             - beta*xdot
    //             ;
    // float new_xdot = xdot + new_xddot*dt;
    // float new_x = x + new_xdot*dt;

    // RK4 
    float k1v = (w0*w0*(psi-x) - beta*xdot) *dt;
    float k1x = xdot*dt;

    float k2v = (w0*w0*(psi-x-k1x/2.) - beta*(xdot+k1v/2.) ) *dt;
    float k2x = (xdot + k1v/2.)*dt;

    float k3v = (w0*w0*(psi-x-k2x/2.) - beta*(xdot+k2v/2.) ) *dt;
    float k3x = (xdot + k2v/2.)*dt;

    float k4v = (w0*w0*(psi-x-k3x) - beta*(xdot+k3v) ) *dt;
    float k4x = (xdot + k3v)*dt;

    float new_xdot = xdot + (k1v + 2.*k2v + 2.*k3v + k3v)/6.;
    float new_x    = x    + (k1x + 2.*k2x + 2.*k3x + k4v)/6.;


    if(output_mode==0)       gl_FragColor.xyz = encodeValue(new_x);
    else if(output_mode==1) gl_FragColor.xyz = encodeValue(new_xdot);
    // else if(output_mode==2) gl_FragColor.xyz = encodeValue(new_xddot);
    gl_FragColor.a = rgba_osc.a;

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
uniform float blur;
uniform float width;  // size of input textures, in pixels
uniform float height;
uniform float scale;

void main() {
  // find the input texture values
  vec4 raw = texture2D(tex,vUv);
  float psi;


  if(blur>0.0) {
    // gl_FragColor = vec4( 1., 0., 0., 1.);
    // return;

    vec2 pixel = vec2(1.0/width,1.0/height);
    int iblur = int(blur);
    // int ix, iy;
    float closest = 10000.0;
    float y =0.;
    float r;
    vec2 offset;
    int got = 0;
    for(int ix=-10; ix<11; ix++){
        for(int iy=-10; iy<11; iy++) {
          // if(ix<-iblur) continue;
          // if(ix> iblur) continue;
          // if(iy<-iblur) continue;
          // if(iy> iblur) continue;
          offset = vec2(pixel.x*float(ix),pixel.y*float(iy));
          vec4 rgba = texture2D(tex,vUv+offset);
          if(rgba.a>0.) {
            r = length(vec2(ix,iy));
            if((r < blur )&& (r < closest)) {
            // if(r<closest) {
              y = decodeValue(texture2D(tex,vUv+offset).xyz);
              closest = r;
              got = 1;              
            }
          }
        }
    }
    // if(got==0) {
    //     gl_FragColor = vec4( 1.0, 
    //                     1.0, 
    //                     1.0,
    //                     1.0);
    //    return;
    // }
    psi = y;
  } else {
      // No blur.
      if(raw.a==0.0) {
       gl_FragColor = vec4( 1.0, 
                        1.0, 
                        1.0,
                        1.0);
       return;
      } else {
        psi = decodeValue(raw.xyz);
      }

  }               
  gl_FragColor = vec4( scale*psi/2.0 + 0.5, 
                    0.0, 
                    scale*psi / 2.0 + 0.5, 
                    1.0);
} 
`;



