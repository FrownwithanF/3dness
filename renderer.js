// renderer.js
class Renderer {
  constructor(canvas) {
    this.ctx = canvas.getContext('2d');
    this.W = canvas.width; this.H = canvas.height;
    this.frame = this.ctx.getImageData(0,0,this.W,this.H);
    this.depth = new Float32Array(this.W*this.H);
    this.clearColor = {r:0,g:0,b:0,a:255};
    this.fov = 200;
    this.cx = this.W>>1; this.cy = this.H>>1;
    this.scale = 25;
    this.zOff  = 200;
  }
  clear() {
    this.depth.fill(Infinity);
    let d = this.frame.data;
    for (let i=0; i<d.length; i+=4) {
      d[i]=this.clearColor.r; d[i+1]=this.clearColor.g;
      d[i+2]=this.clearColor.b; d[i+3]=this.clearColor.a;
    }
  }
  present() {
    this.ctx.putImageData(this.frame,0,0);
  }
  static multiply(a,b) {
    let m = new Float32Array(16);
    for (let i=0;i<4;i++) for (let j=0;j<4;j++){
      let s=0; for (let k=0;k<4;k++) s+=a[i*4+k]*b[k*4+j];
      m[i*4+j]=s;
    }
    return m;
  }
  static transform(v,m){
    return {
      x:v[0]*m[0]+v[1]*m[4]+v[2]*m[8]+m[12],
      y:v[0]*m[1]+v[1]*m[5]+v[2]*m[9]+m[13],
      z:v[0]*m[2]+v[1]*m[6]+v[2]*m[10]+m[14]
    };
  }
  renderMesh(mesh,model,view,colors,texture){
    const mv = Renderer.multiply(view,model),
          raw = mesh.vertices.map(v=>Renderer.transform(v,mv));
    let normals = raw.map(()=>({x:0,y:0,z:0}));
    mesh.triangles.forEach(tri=>{
      const [i0,i1,i2]=tri.indices, v0=raw[i0],v1=raw[i1],v2=raw[i2],
            e1={x:v1.x-v0.x,y:v1.y-v0.y,z:v1.z-v0.z},
            e2={x:v2.x-v0.x,y:v2.y-v0.y,z:v2.z-v0.z},
            fn={x:e1.y*e2.z-e1.z*e2.y,y:e1.z*e2.x-e1.x*e2.z,z:e1.x*e2.y-e1.y*e2.x};
      [i0,i1,i2].forEach(i=>{normals[i].x+=fn.x;normals[i].y+=fn.y;normals[i].z+=fn.z;});
    });
    normals = normals.map(n=>{const L=Math.hypot(n.x,n.y,n.z)||1;return{x:n.x/L,y:n.y/L,z:n.z/L};});
    const light={x:0,y:0,z:-1}, bri=normals.map(n=>Math.max(0,n.x*light.x+n.y*light.y+n.z*light.z)),
          screen = raw.map(p=>{
            const z=p.z*this.scale+this.zOff;
            return{ x:(p.x*this.scale)*this.fov/z+this.cx, y:(p.y*this.scale)*this.fov/z+this.cy, z };
          }),
          buf=this.frame.data, zbuf=this.depth;
    mesh.triangles.forEach(tri=>{
      const [i0,i1,i2]=tri.indices;
      if((normals[i0].z+normals[i1].z+normals[i2].z)/3>=0) return;
      const p0=screen[i0],p1=screen[i1],p2=screen[i2],
            minX=Math.max(0,Math.floor(Math.min(p0.x,p1.x,p2.x))),
            maxX=Math.min(this.W-1,Math.ceil(Math.max(p0.x,p1.x,p2.x))),
            minY=Math.max(0,Math.floor(Math.min(p0.y,p1.y,p2.y))),
            maxY=Math.min(this.H-1,Math.ceil(Math.max(p0.y,p1.y,p2.y))),
            denom=(p1.y-p2.y)*(p0.x-p2.x)+(p2.x-p1.x)*(p0.y-p2.y);
      if(!denom) return; const inv=1/denom;
      for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
        const w0=((p1.y-p2.y)*(x-p2.x)+(p2.x-p1.x)*(y-p2.y))*inv,
              w1=((p2.y-p0.y)*(x-p2.x)+(p0.x-p2.x)*(y-p2.y))*inv,
              w2=1-w0-w1;
        if(w0<0||w1<0||w2<0) continue;
        const z=w0*p0.z+w1*p1.z+w2*p2.z, idx=y*this.W+x;
        if(z>=zbuf[idx]) continue; zbuf[idx]=z;
        const B=w0*bri[i0]+w1*bri[i1]+w2*bri[i2], di=idx<<2;
        if(texture){
          const u=((mesh.uvs[i0][0]*w0+mesh.uvs[i1][0]*w1+mesh.uvs[i2][0]*w2)*(texture.width-1)|0),
                v=((mesh.uvs[i0][1]*w0+mesh.uvs[i1][1]*w1+mesh.uvs[i2][1]*w2)*(texture.height-1)|0),
                ti=(v*texture.width+u)<<2;
          buf[di]=texture.data[ti]*B|0;
          buf[di+1]=texture.data[ti+1]*B|0;
          buf[di+2]=texture.data[ti+2]*B|0;
          buf[di+3]=255;
        } else {
          const c=colors[0];
          buf[di]=c.r*B|0; buf[di+1]=c.g*B|0; buf[di+2]=c.b*B|0; buf[di+3]=255;
        }
      }
    });
  }
}
window.Renderer=Renderer;
