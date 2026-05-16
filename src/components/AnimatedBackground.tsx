import React, { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  size: number;
  speed: number;
  opacity: number;
  angle: number;
  hue: number;
}

interface Cloud {
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  opacity: number;
  circles: { dx: number; dy: number; r: number }[];
}

export default function AnimatedBackground({ loading = false }: { loading?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const loadingRef = useRef(loading);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let animationFrameId: number;
    let time = 0;

    const particles: Particle[] = [];
    const clouds: Cloud[] = [];
    const particleCount = 60;
    const cloudCount = 10;

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = {
        x: (e.clientX / window.innerWidth - 0.5) * 40,
        y: (e.clientY / window.innerHeight - 0.5) * 40
      };
    };

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.scale(dpr, dpr);
      init();
    };

    const init = () => {
      particles.length = 0;
      for (let i = 0; i < particleCount; i++) {
        particles.push({
          x: Math.random() * window.innerWidth,
          y: Math.random() * window.innerHeight,
          size: Math.random() * 3 + 1,
          speed: Math.random() * 0.15 + 0.05,
          opacity: Math.random() * 0.5 + 0.2,
          angle: Math.random() * Math.PI * 2,
          hue: Math.random() * 30 + 190 // Sky/Emerald range
        });
      }

      clouds.length = 0;
      for (let i = 0; i < cloudCount; i++) {
        const circles = [];
        const numCircles = 5 + Math.floor(Math.random() * 5);
        for (let j = 0; j < numCircles; j++) {
          circles.push({
            dx: (Math.random() - 0.5) * 150,
            dy: (Math.random() - 0.5) * 60,
            r: 50 + Math.random() * 80
          });
        }
        clouds.push({
          x: Math.random() * window.innerWidth,
          y: 50 + Math.random() * 400,
          width: 400 + Math.random() * 400,
          height: 150 + Math.random() * 100,
          speed: 0.1 + Math.random() * 0.3,
          opacity: 0.1 + Math.random() * 0.3,
          circles
        });
      }
    };

    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', handleMouseMove);
    resize();

    const drawSky = () => {
      const gradient = ctx.createLinearGradient(0, 0, 0, window.innerHeight);
      gradient.addColorStop(0, '#020617'); 
      gradient.addColorStop(0.4, '#0f172a');
      gradient.addColorStop(0.7, '#1e293b');
      gradient.addColorStop(1, '#020617');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

      // Cyber Glow
      const sunGlow = ctx.createRadialGradient(
        window.innerWidth * 0.8, window.innerHeight * 0.2, 0,
        window.innerWidth * 0.8, window.innerHeight * 0.2, 800
      );
      sunGlow.addColorStop(0, 'rgba(14, 165, 233, 0.15)');
      sunGlow.addColorStop(1, 'rgba(14, 165, 233, 0)');
      ctx.fillStyle = sunGlow;
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    };

    const drawClouds = () => {
      ctx.save();
      clouds.forEach((cloud, i) => {
        const parallaxX = mouseRef.current.x * (0.2 + i * 0.05);
        const parallaxY = mouseRef.current.y * (0.1 + i * 0.05);
        
        const speedMult = loadingRef.current ? 4 : 1;
        cloud.x += cloud.speed * speedMult;
        if (cloud.x > window.innerWidth + 400) cloud.x = -400;

        ctx.globalAlpha = cloud.opacity * 0.2; // Dim the clouds for dark mode
        ctx.fillStyle = '#1e293b';
        
        cloud.circles.forEach(c => {
          ctx.beginPath();
          ctx.arc(cloud.x + c.dx + parallaxX, cloud.y + c.dy + parallaxY, c.r, 0, Math.PI * 2);
          ctx.fill();
        });
      });
      ctx.restore();
    };

    const drawGrid = () => {
      ctx.save();
      ctx.strokeStyle = 'rgba(14, 165, 233, 0.1)';
      ctx.lineWidth = 1;

      const gridSize = 50;
      const parallaxX = mouseRef.current.x * 0.2;
      const parallaxY = mouseRef.current.y * 0.2;

      for (let x = (parallaxX % gridSize); x < window.innerWidth; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, window.innerHeight);
        ctx.stroke();
      }

      for (let y = (parallaxY % gridSize); y < window.innerHeight; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(window.innerWidth, y);
        ctx.stroke();
      }
      ctx.restore();
    };

    const drawParticles = () => {
      ctx.save();
      particles.forEach(p => {
        const speedMult = loadingRef.current ? 8 : 2;
        p.y -= p.speed * speedMult;
        p.x += Math.sin(time + p.angle) * 0.5;
        
        if (p.y < -50) {
          p.y = window.innerHeight + 50;
          p.x = Math.random() * window.innerWidth;
        }

        const flicker = (Math.sin(time * 3 + p.angle) + 1.2) / 2.2;
        ctx.globalAlpha = p.opacity * flicker;
        const hue = loadingRef.current ? 200 : p.hue;
        ctx.fillStyle = `hsla(${hue}, 100%, 70%, 1)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        
        if (loadingRef.current) {
          ctx.shadowBlur = 10;
          ctx.shadowColor = `hsla(${hue}, 100%, 70%, 1)`;
        }
      });
      ctx.restore();
    };

    const drawPostProcessing = () => {
      // Vignette
      const vignette = ctx.createRadialGradient(
        window.innerWidth / 2, window.innerHeight / 2, window.innerWidth * 0.1,
        window.innerWidth / 2, window.innerHeight / 2, window.innerWidth * 1.2
      );
      vignette.addColorStop(0, 'rgba(255, 255, 255, 0)');
      vignette.addColorStop(1, 'rgba(2, 6, 23, 0.4)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

      // Rainbow Lens Flare
      const flareTime = time * 0.1;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 3; i++) {
        const x = window.innerWidth * 0.8 - i * 150 + Math.sin(flareTime + i) * 50;
        const y = window.innerHeight * 0.2 + i * 100 + Math.cos(flareTime + i) * 50;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 80 + i * 40);
        const hue = (flareTime * 50 + i * 60) % 360;
        g.addColorStop(0, `hsla(${hue}, 80%, 70%, 0.15)`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, 100 + i * 50, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };

    const render = () => {
      time += 0.005;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      drawSky();
      drawGrid();
      drawClouds();
      drawParticles();
      drawPostProcessing();

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-[-1]">
      <canvas 
        ref={canvasRef} 
        style={{ width: '100vw', height: '100vh' }}
        id="premium-bg-canvas"
      />
      {/* Cinematic Blur Overlay for UI Readability */}
      <div className="absolute inset-0 bg-slate-950/20 backdrop-blur-[2px] pointer-events-none z-10" />
    </div>
  );
}
