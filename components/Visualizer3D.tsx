import React, { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Points, PointMaterial } from '@react-three/drei';
import * as THREE from 'three';

interface Props {
  speed: number;
  color: string;
}

// Generate random points in a tunnel/cylinder shape
function generateTunnelParticles(count: number, radius: number, length: number) {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        // Random angle
        const theta = Math.random() * Math.PI * 2;
        // Random distance from center (inner radius to outer radius)
        const r = radius * (0.5 + Math.random()); 
        
        const x = r * Math.cos(theta);
        const y = r * Math.sin(theta);
        const z = (Math.random() - 0.5) * length;
        
        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;
    }
    return positions;
}

const StarTunnel = ({ speed, color }: Props) => {
  const ref = useRef<THREE.Points>(null);
  
  const count = 3000;
  const positions = useMemo(() => generateTunnelParticles(count, 5, 50), []);
  
  useFrame((state, delta) => {
    if (ref.current) {
        // Rotate the entire tunnel slowly
        ref.current.rotation.z += delta * 0.1;
        
        // Move particles towards camera to create speed effect
        const positions = ref.current.geometry.attributes.position.array as Float32Array;
        const moveSpeed = Math.max(2, speed * 2); // Map Hz to speed
        
        for(let i=0; i < count; i++) {
            let zIndex = i * 3 + 2;
            positions[zIndex] += delta * moveSpeed;
            
            // Loop back
            if (positions[zIndex] > 20) {
                positions[zIndex] -= 50;
            }
        }
        ref.current.geometry.attributes.position.needsUpdate = true;
    }
  });

  return (
    <Points 
      ref={ref} 
      positions={positions} 
      stride={3} 
      frustumCulled={false} 
      rotation={[0, 0, Math.PI / 4]}
    >
        <PointMaterial
          transparent
          color={color}
          size={0.05}
          sizeAttenuation={true}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
    </Points>
  );
};

const SceneSetup = () => {
    const { scene } = useThree();
    useEffect(() => {
        scene.background = new THREE.Color('#020617');
        scene.fog = new THREE.Fog('#020617', 5, 25);
    }, [scene]);
    return null;
}

const Visualizer3D: React.FC<Props> = ({ speed, color }) => {
  return (
    <div className="absolute inset-0 w-full h-full">
        <Canvas camera={{ position: [0, 0, 10], fov: 75 }} gl={{ antialias: false, alpha: true }}>
            <SceneSetup />
            <StarTunnel speed={speed} color={color} />
        </Canvas>
    </div>
  );
};

export default Visualizer3D;