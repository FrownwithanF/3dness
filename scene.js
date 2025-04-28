// scene.js
const input     = document.getElementById('model-input'),
      recordBtn = document.getElementById('record-btn'),
      canvas    = document.getElementById('viewport');

// load GLB (unchanged)
input.addEventListener('change',e=>{
  const f=e.target.files[0];
  if(!f||!f.name.toLowerCase().endsWith('.glb')) return alert('Pick a .glb');
  const r=new FileReader();
  r.onload=()=>parseGLB(r.result);
  r.readAsArrayBuffer(f);
});

function parseGLB(ab){
  const dv=new DataView(ab);
  if(dv.getUint32(0,true)!==0x46546C67) return alert('Invalid GLB');
  const total=dv.getUint32(8,true);
  let off=12,json=null,bin=null;
  while(off<total){
    const len=dv.getUint32(off,true), tp=dv.getUint32(off+4,true),
          data=ab.slice(off+8,off+8+len);
    if(tp===0x4E4F534A) json=JSON.parse(new TextDecoder().decode(data));
    else if(tp===0x004E4942) bin=data;
    off+=8+len;
  }
  if(!json||!bin) return alert('Malformed GLB');
  buildScene(json,bin);
}

// getAcc unchanged

function getAcc(gltf,bin,i){
  const a=gltf.accessors[i], bv=gltf.bufferViews[a.bufferView],
        base=bv.byteOffset||0, off=a.byteOffset||0,
        slice=bin.slice(base+off,base+bv.byteLength),
        compSize= a.componentType===5126||a.componentType===5125?4:
                  a.componentType===5123?2:1,
        comps={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a.type],
        Ctor= a.componentType===5126?Float32Array:
              a.componentType===5125?Uint32Array:
              a.componentType===5123?Uint16Array:Uint8Array,
        maxLen=Math.floor(slice.byteLength/compSize);
  return {arr:new Ctor(slice,0,maxLen), cnt:a.count};
}

function buildScene(gltf,bin){
  const prim=gltf.meshes[0].primitives[0],
        P=getAcc(gltf,bin,prim.attributes.POSITION),
        U=getAcc(gltf,bin,prim.attributes.TEXCOORD_0),
        I=getAcc(gltf,bin,prim.indices),
        mesh={vertices:[],uvs:[],triangles:[]};

  for(let i=0;i<P.cnt;i++){
    mesh.vertices.push([P.arr[3*i],P.arr[3*i+1],P.arr[3*i+2]]);
    mesh.uvs.push([U.arr[2*i],U.arr[2*i+1]]);
  }
  for(let i=0,f=0;i<I.cnt;i+=3,f++){
    mesh.triangles.push({indices:[I.arr[i],I.arr[i+1],I.arr[i+2]],face:0});
  }

  const imgInfo=gltf.images&&gltf.images[0];
  if(imgInfo&&imgInfo.bufferView!=null){
    const bv=gltf.bufferViews[imgInfo.bufferView],
          slice=bin.slice(bv.byteOffset,bv.byteOffset+bv.byteLength),
          blob=new Blob([slice],{type:imgInfo.mimeType}),
          img=new Image();
    img.onload=()=>{
      const off=document.createElement('canvas');
      off.width=img.width; off.height=img.height;
      off.getContext('2d').drawImage(img,0,0);
      startScene(mesh,off.getContext('2d').getImageData(0,0,img.width,img.height));
    };
    img.src=URL.createObjectURL(blob);
  } else {
    startScene(mesh,null);
  }
}

function startScene(mesh,texture){
  const R    = new Renderer(canvas),
        view = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];

  // fixed spin speeds (always positive)
  const spinSpeed = { x:0.01, y:0.007, z:0.013 };

  let ax = 0, ay = 0, az = 0,
      vx = 0, vy = 0,
      dragging = false,
      last = { x:0, y:0, t:0 },
      hue = 0;

  // zoom on wheel (unchanged)
  canvas.addEventListener('wheel', e=>{
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    R.scale = Math.min(500, Math.max(1, R.scale * factor));
  });

  // mouse drag handlers (unchanged)
  canvas.addEventListener('mousedown', e=>{
    dragging = true;
    last = { x:e.clientX, y:e.clientY, t:performance.now() };
    vx = vy = 0;
  });
  canvas.addEventListener('mousemove', e=>{
    if(!dragging) return;
    const now = performance.now(),
          dx  = e.clientX - last.x,
          dy  = e.clientY - last.y,
          dt  = Math.max(1, now - last.t);
    ay += dx * 0.01;
    ax += dy * 0.01;
    vx = dx / dt * 0.01;
    vy = dy / dt * 0.01;
    last = { x:e.clientX, y:e.clientY, t:now };
  });
  ['mouseup','mouseleave'].forEach(evt=>
    canvas.addEventListener(evt, ()=>dragging = false)
  );

  // GIF record (unchanged)
  let recording = false, startAz = 0, gif;
  recordBtn.addEventListener('click', ()=>{
    if(recording) return;
    recording = true;
    startAz = az;
    gif = new GIF({
      workers:2,
      quality:10,
      width:canvas.width,
      height:canvas.height,
      workerScript:'gif.worker.js'
    });
    gif.on('finished', blob=>{
      const url = URL.createObjectURL(blob),
            a   = document.createElement('a');
      a.href = url; a.download = 'capture.gif'; a.click();
      recordBtn.disabled = false;
      recordBtn.textContent = 'Record GIF';
    });
    recordBtn.disabled = true;
    recordBtn.textContent = 'Recording…';
  });

  // main render loop
  (function frame(){
    R.clear();

    if (dragging) {
      // drag‐based rotation overrides X/Y only
      // Z continues spinning
      az += spinSpeed.z;
    } else {
      // continuous spin on all axes
      ax += spinSpeed.x;
      ay += spinSpeed.y;
      az += spinSpeed.z;
    }

    // record if requested
    if (recording) {
      gif.addFrame(canvas, { copy:true, delay:1000/60 });
      // when we've spun at least one full Z‐rotation, stop
      if (az - startAz >= Math.PI*2) {
        recording = false;
        gif.render();
      }
    }

    // dynamic fallback color
    hue += 0.02;
    const r = Math.floor((Math.sin(hue)+1)/2*255),
          g = Math.floor((Math.sin(hue+2.1)+1)/2*255),
          b = Math.floor((Math.sin(hue+4.2)+1)/2*255),
          dyn = [{ r, g, b }];

    // build model matrix and render
    const rot = (x,y,z) => {
      const cx=Math.cos(x), sx=Math.sin(x),
            cy=Math.cos(y), sy=Math.sin(y),
            cz=Math.cos(z), sz=Math.sin(z),
            Rx=[1,0,0,0,   0,cx,-sx,0,   0,sx,cx,0,   0,0,0,1],
            Ry=[cy,0,sy,0, 0,1,0,0,   -sy,0,cy,0,  0,0,0,1],
            Rz=[cz,-sz,0,0, sz,cz,0,0,   0,0,1,0,   0,0,0,1];
      return Renderer.multiply(Rz, Renderer.multiply(Ry, Rx));
    };

    const model = Renderer.multiply(
      rot(0,0,az),
      Renderer.multiply(rot(0,ay,0), rot(ax,0,0))
    );

    R.renderMesh(mesh, model, view, texture?null:dyn, texture);
    R.present();
    requestAnimationFrame(frame);
  })();
}
