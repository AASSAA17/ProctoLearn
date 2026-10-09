'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/** One decorative object. Render only while settling after a pointer or size change. */
export default function KnowledgeScene() {
  const host = useRef(null);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    } catch {
      return; // The CSS artwork underneath remains visible without WebGL.
    }
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#101525');
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 30);
    camera.position.set(0, 0, 6);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor('#101525', 1);
    element.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block';

    const sculpture = new THREE.Group();
    scene.add(sculpture);
    const glass = new THREE.MeshPhysicalMaterial({
      color: '#8875ed', metalness: 0.25, roughness: 0.14,
      transparent: true, opacity: 0.55, clearcoat: 1, side: THREE.DoubleSide,
    });
    const geometry = new THREE.BoxGeometry(1.55, 1.55, 1.55);
    sculpture.add(new THREE.Mesh(geometry, glass));
    const edges = new THREE.EdgesGeometry(geometry);
    const edgeMaterial = new THREE.LineBasicMaterial({ color: '#b6a8ff', transparent: true, opacity: 0.8 });
    sculpture.add(new THREE.LineSegments(edges, edgeMaterial));
    const coreGeometry = new THREE.IcosahedronGeometry(0.48, 0);
    const coreMaterial = new THREE.MeshStandardMaterial({ color: '#64dafa', metalness: 0.3, roughness: 0.3, emissive: '#125269', emissiveIntensity: 0.6 });
    sculpture.add(new THREE.Mesh(coreGeometry, coreMaterial));
    const orbitGeometry = new THREE.TorusGeometry(1.5, 0.009, 6, 80);
    const orbitMaterial = new THREE.MeshBasicMaterial({ color: '#8b7ef2', transparent: true, opacity: 0.65 });
    const orbit = new THREE.Mesh(orbitGeometry, orbitMaterial);
    orbit.rotation.set(1.15, 0.4, 0.1);
    sculpture.add(orbit);
    scene.add(new THREE.HemisphereLight('#e2e8ff', '#182145', 3));
    const light = new THREE.DirectionalLight('#b7eeff', 4);
    light.position.set(2, 3, 4);
    scene.add(light);
    const accent = new THREE.PointLight('#a78bfa', 20);
    accent.position.set(-2, -1, 2);
    scene.add(accent);

    let frame = 0;
    let disposed = false;
    let contextLost = false;
    let targetX = 0.35;
    let targetY = 0.6;
    sculpture.rotation.set(0.2, 0.4, 0.1);
    const render = () => {
      frame = 0;
      if (disposed || contextLost || document.hidden) return;
      sculpture.rotation.x += (targetX - sculpture.rotation.x) * 0.08;
      sculpture.rotation.y += (targetY - sculpture.rotation.y) * 0.08;
      renderer.render(scene, camera);
      if (Math.abs(targetX - sculpture.rotation.x) + Math.abs(targetY - sculpture.rotation.y) > 0.001) {
        frame = requestAnimationFrame(render);
      }
    };
    const schedule = () => { if (!frame && !disposed && !contextLost) frame = requestAnimationFrame(render); };
    const resize = () => {
      const { width, height } = element.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      schedule();
    };
    const pointer = (event) => {
      const rect = element.getBoundingClientRect();
      targetY = 0.6 + ((event.clientX - rect.left) / rect.width - 0.5) * 0.35;
      targetX = 0.35 + ((event.clientY - rect.top) / rect.height - 0.5) * 0.2;
      schedule();
    };
    const reset = () => { targetX = 0.35; targetY = 0.6; schedule(); };
    const lost = (event) => {
      event.preventDefault();
      contextLost = true;
      cancelAnimationFrame(frame);
      frame = 0;
      renderer.domElement.style.visibility = 'hidden';
    };
    const restored = () => { contextLost = false; renderer.domElement.style.visibility = 'visible'; schedule(); };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    element.addEventListener('pointermove', pointer);
    element.addEventListener('pointerleave', reset);
    renderer.domElement.addEventListener('webglcontextlost', lost);
    renderer.domElement.addEventListener('webglcontextrestored', restored);
    resize();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      element.removeEventListener('pointermove', pointer);
      element.removeEventListener('pointerleave', reset);
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      renderer.domElement.removeEventListener('webglcontextrestored', restored);
      [geometry, edges, coreGeometry, orbitGeometry, glass, edgeMaterial, coreMaterial, orbitMaterial].forEach((resource) => resource.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={host} className="absolute inset-0" />;
}
