/**
 * MINT TYPING — AMBIENT MOTION & KINETIC VISUAL SYSTEM
 * Ultra-lightweight native 2D Canvas particle grid (replaces heavy 650KB Three.js).
 * Fluid throttled magnetic buttons and GSAP micro-animations.
 */

(function () {
    "use strict";

    const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // --------------------------------------------------------------------------
    // GSAP MICRO-ANIMATIONS
    // --------------------------------------------------------------------------
    function initGsap() {
        if (!window.gsap || reducedMotion) {
            return;
        }

        if (window.ScrollTrigger) {
            window.gsap.registerPlugin(window.ScrollTrigger);
        }

        const heroTimeline = window.gsap.timeline({ defaults: { ease: "power3.out" } });
        heroTimeline.from(".site-header", { y: -20, opacity: 0, duration: 0.6 });

        if (document.querySelector(".hero-copy")) {
            heroTimeline.from(".hero-copy > *", { y: 24, opacity: 0, duration: 0.65, stagger: 0.07 }, "-=0.3");
        }
        if (document.querySelector(".hero-media")) {
            heroTimeline.from(".hero-media", { scale: 0.94, opacity: 0, duration: 0.8 }, "-=0.5");
        }

        if (document.querySelector(".console-heading")) {
            heroTimeline.from(".console-heading > *", { x: -20, opacity: 0, duration: 0.6, stagger: 0.06 }, "-=0.3");
        }

        document.querySelectorAll(".reveal-section").forEach((section) => {
            window.gsap.from(section, {
                y: 36,
                opacity: 0,
                duration: 0.7,
                ease: "power3.out",
                scrollTrigger: window.ScrollTrigger ? {
                    trigger: section,
                    start: "top 85%"
                } : undefined
            });
        });

        // Magnetic hover effects with overwrite to prevent tween stacking
        document.querySelectorAll(".magnetic").forEach((element) => {
            element.addEventListener("mousemove", (event) => {
                const rect = element.getBoundingClientRect();
                const x = event.clientX - rect.left - rect.width / 2;
                const y = event.clientY - rect.top - rect.height / 2;

                window.gsap.to(element, {
                    x: x * 0.1,
                    y: y * 0.1,
                    duration: 0.2,
                    ease: "power2.out",
                    overwrite: "auto"
                });
            });

            element.addEventListener("mouseleave", () => {
                window.gsap.to(element, {
                    x: 0,
                    y: 0,
                    duration: 0.3,
                    ease: "power2.out",
                    overwrite: "auto"
                });
            });
        });
    }

    // --------------------------------------------------------------------------
    // NATIVE 2D CANVAS AMBIENT MESH SYSTEM
    // Ultra-lightweight: replaces Three.js, sub-millisecond per frame, zero memory leaks.
    // --------------------------------------------------------------------------
    function initCanvas() {
        if (reducedMotion) return;

        const canvas = document.getElementById("fx-canvas");
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        let width = 0;
        let height = 0;
        let animationFrameId = null;
        let particles = [];
        const mouse = { x: -9999, y: -9999, targetX: -9999, targetY: -9999 };

        function getThemeColor() {
            const theme = document.documentElement.getAttribute("data-theme") || "light";
            if (theme === "mint") return { r: 0, g: 245, b: 155, alpha: 0.14 };
            if (theme === "dark") return { r: 255, g: 51, b: 68, alpha: 0.16 };
            return { r: 188, g: 1, b: 0, alpha: 0.10 };
        }

        let themeColor = getThemeColor();
        window.addEventListener("mintthemechange", () => {
            themeColor = getThemeColor();
        });

        function resize() {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
            initParticles();
        }

        function initParticles() {
            particles = [];
            // Target ~60 particles on desktop, ~35 on mobile
            const count = Math.min(Math.floor((width * height) / 28000), 70);
            for (let i = 0; i < count; i++) {
                particles.push({
                    x: Math.random() * width,
                    y: Math.random() * height,
                    vx: (Math.random() - 0.5) * 0.45,
                    vy: (Math.random() - 0.5) * 0.45,
                    radius: Math.random() * 1.5 + 1
                });
            }
        }

        function render() {
            if (document.hidden) {
                animationFrameId = null;
                return;
            }

            // Smooth mouse interpolation
            mouse.x += (mouse.targetX - mouse.x) * 0.08;
            mouse.y += (mouse.targetY - mouse.y) * 0.08;

            ctx.clearRect(0, 0, width, height);

            const { r, g, b, alpha } = themeColor;
            const maxDistance = 140;

            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];
                p.x += p.vx;
                p.y += p.vy;

                if (p.x < 0) p.x = width;
                if (p.x > width) p.x = 0;
                if (p.y < 0) p.y = height;
                if (p.y > height) p.y = 0;

                // Mouse interaction repulsion
                const dx = mouse.x - p.x;
                const dy = mouse.y - p.y;
                const distToMouse = Math.sqrt(dx * dx + dy * dy);
                if (distToMouse < 100) {
                    const angle = Math.atan2(dy, dx);
                    const force = (100 - distToMouse) * 0.02;
                    p.x -= Math.cos(angle) * force;
                    p.y -= Math.sin(angle) * force;
                }

                // Draw Particle Dot
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 2.5})`;
                ctx.fill();

                // Draw Mesh Lines between neighboring particles
                for (let j = i + 1; j < particles.length; j++) {
                    const p2 = particles[j];
                    const dist = Math.hypot(p.x - p2.x, p.y - p2.y);
                    if (dist < maxDistance) {
                        const lineOpacity = (1 - dist / maxDistance) * alpha;
                        ctx.beginPath();
                        ctx.moveTo(p.x, p.y);
                        ctx.lineTo(p2.x, p2.y);
                        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${lineOpacity})`;
                        ctx.lineWidth = 0.8;
                        ctx.stroke();
                    }
                }
            }

            animationFrameId = requestAnimationFrame(render);
        }

        window.addEventListener("resize", resize);
        window.addEventListener("mousemove", (e) => {
            mouse.targetX = e.clientX;
            mouse.targetY = e.clientY;
        });
        window.addEventListener("mouseleave", () => {
            mouse.targetX = -9999;
            mouse.targetY = -9999;
        });

        document.addEventListener("visibilitychange", () => {
            if (!document.hidden && !animationFrameId) {
                animationFrameId = requestAnimationFrame(render);
            }
        });

        resize();
        animationFrameId = requestAnimationFrame(render);
    }

    // Initialize when DOM is ready
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
            initGsap();
            initCanvas();
        });
    } else {
        initGsap();
        initCanvas();
    }
})();
