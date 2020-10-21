void test(void)
{
  // remembered state variables
  float x1 = 1; 
  float x2 = 1;//most recent

  float last_v = 0;


  float dt = 1.0;
  float beta = 0.000;
  float w0 = 0.2;

  float t = 0;
  float i = 0;

  TGraph* gr = new TGraph();

  while(t<100/w0) {
    // original alg.
    float xdot = (x2-x1)/dt;
    // save v,x instead of 2 xs
    // float xdot = last_v;
    float xddot = -x2*w0*w0 - beta*xdot;
    float new_xdot = xdot + xddot*dt;
    float new_x = x2 + new_xdot*dt;

    // 2nd order runga-kutta. https://math.stackexchange.com/questions/2023819/using-the-runge-kuttas-method-to-solve-a-2nd-derivative-question
    float c0 = xdot;
    float k0 = xddot;
    float c1 = xdot + dt/2 * k0;
    float k1 = -w0*w0*(x2+dt/2*c0) - beta*c1;
    float c2 = xdot + dt/2*k1;
    float k2 = -w0*w0*(x2+dt/2*c1) - beta*c2;
    float c3 = xdot + dt*k2;
    // float k3 = -w0*w0*(x2+dt*c2) - beta*c3;
    new_x = x2 + dt*(xdot + dt/6*(k0+k1+k2));


    x1 = x2;
    x2 = new_x;
    last_v = new_xdot;

    gr->SetPoint(i,t,new_x);
    i++;
    t+=dt;

  }
  gr->Draw("AC*");
}