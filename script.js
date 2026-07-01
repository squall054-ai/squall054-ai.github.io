const canvas = document.getElementById("particles");
const ctx = canvas.getContext("2d");

let particles = [];

function resize(){

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

}

window.addEventListener("resize", resize);

resize();

class Particle{

    constructor(){

        this.reset();

        this.y = Math.random()*canvas.height;

    }

    reset(){

        this.x = Math.random()*canvas.width;

        this.y = canvas.height + Math.random()*300;

        this.size = Math.random()*3+1;

        this.speed = Math.random()*0.8+0.3;

        this.alpha = Math.random()*0.5+0.2;

        this.color = Math.random()>0.5 ?
            "100,180,255" :
            "170,80,255";

    }

    update(){

        this.y -= this.speed;

        if(this.y < -20){

            this.reset();

        }

    }

    draw(){

        ctx.beginPath();

        ctx.fillStyle =
        `rgba(${this.color},${this.alpha})`;

        ctx.arc(this.x,this.y,this.size,0,Math.PI*2);

        ctx.fill();

    }

}

for(let i=0;i<180;i++){

    particles.push(new Particle());

}

function animate(){

    ctx.clearRect(0,0,canvas.width,canvas.height);

    particles.forEach(p=>{

        p.update();

        p.draw();

    });

    requestAnimationFrame(animate);

}

animate();