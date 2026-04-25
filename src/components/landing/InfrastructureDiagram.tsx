import { useRef, useState, useEffect, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { RoundedBox, Text, Billboard, Edges, Line } from "@react-three/drei";
import type { Line2 } from "three-stdlib";

const ACCENT = "#E67A3A";
const FG = "#FAFAFA";
const DIM = "#888888";
const STROKE = "#6a6a6a";
const BOX = "#2c2c2c";
const BOX_LIGHT = "#3a3a3a";

type V3 = [number, number, number];

/* ─────────── Nodes (all use smooth RoundedBox now) ─────────── */

function SecurityBox({ position }: { position: V3 }) {
  return (
    <group position={position}>
      <RoundedBox args={[1.4, 1.4, 1.4]} radius={0.1} smoothness={4}>
        <meshStandardMaterial color={BOX} metalness={0.15} roughness={0.55} />
        <Edges color={STROKE} />
      </RoundedBox>
      <mesh position={[0, 0, 0.705]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.36, 0.36, 0.03, 5]} />
        <meshStandardMaterial
          color={ACCENT}
          emissive={ACCENT}
          emissiveIntensity={0.5}
        />
      </mesh>
    </group>
  );
}

function Monitor({ position }: { position: V3 }) {
  return (
    <group position={position}>
      {/* base — rounded */}
      <RoundedBox
        args={[0.7, 0.12, 0.4]}
        radius={0.03}
        smoothness={4}
        position={[0, -0.55, 0]}
      >
        <meshStandardMaterial color={BOX_LIGHT} />
        <Edges color={STROKE} />
      </RoundedBox>
      {/* stand pole */}
      <mesh position={[0, -0.35, 0]}>
        <boxGeometry args={[0.12, 0.3, 0.12]} />
        <meshStandardMaterial color={BOX_LIGHT} />
      </mesh>
      {/* screen body — rounded, no Edges (RoundedBox + Edges was rendering back-face outlines as a ghost "glass pane") */}
      <RoundedBox
        args={[1.9, 1.25, 0.14]}
        radius={0.08}
        smoothness={4}
        position={[0, 0.35, 0]}
      >
        <meshStandardMaterial color={BOX} metalness={0.2} roughness={0.55} />
      </RoundedBox>
      {/* faux UI rows directly on the body's front face (no glass pane behind) */}
      {[0.3, 0.1, -0.1, -0.3].map((y, i) => (
        <mesh key={i} position={[-0.3, y + 0.35, 0.075]}>
          <planeGeometry args={[0.9, 0.05]} />
          <meshBasicMaterial
            color={i === 0 ? ACCENT : "#4a4a4a"}
            transparent
            opacity={i === 0 ? 0.9 : 0.85}
          />
        </mesh>
      ))}
    </group>
  );
}

function ServerRack({ position }: { position: V3 }) {
  const size: V3 = [1.4, 2.0, 1.4];
  return (
    <group position={position}>
      <RoundedBox args={size} radius={0.1} smoothness={4}>
        <meshStandardMaterial color={BOX} metalness={0.2} roughness={0.55} />
        <Edges color={STROKE} />
      </RoundedBox>
      <mesh
        position={[size[0] / 2 - 0.25, size[1] / 2 - 0.25, size[2] / 2 + 0.005]}
      >
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshBasicMaterial color="#00D26A" />
      </mesh>
      <mesh
        position={[size[0] / 2 - 0.25, size[1] / 2 - 0.48, size[2] / 2 + 0.005]}
      >
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshBasicMaterial color={ACCENT} />
      </mesh>
    </group>
  );
}

function Database({ position }: { position: V3 }) {
  const r = 0.75;
  const h = 0.42;
  return (
    <group position={position}>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0, h / 2 + i * h - h, 0]}>
          <cylinderGeometry args={[r, r, h, 32]} />
          <meshStandardMaterial color={BOX} metalness={0.2} roughness={0.55} />
          <Edges color={STROKE} />
        </mesh>
      ))}
    </group>
  );
}

/* ─────────── Circuit trace (L-shape, animated dash flow) ─────────── */

function CircuitTrace({
  from,
  to,
  vertical = false,
}: {
  from: V3;
  to: V3;
  vertical?: boolean;
}) {
  const lineRef = useRef<Line2>(null);

  // Route traces so they never pass through the node bodies.
  // Desktop (horizontal): drop to ground plane y=0, straight across.
  // Mobile (vertical): loop out to the right side of the stack and back.
  const points: V3[] = vertical
    ? [
        from,
        [from[0] + 1.8, from[1], from[2]],
        [to[0] + 1.8, to[1], to[2]],
        to,
      ]
    : [
        [from[0], 0, from[2]],
        [to[0], 0, to[2]],
      ];

  useFrame(() => {
    const mat = lineRef.current?.material;
    if (mat) mat.dashOffset -= 0.008;
  });

  return (
    <>
      {/* dim base trace */}
      <Line points={points} color="#333333" lineWidth={1.5} />
      {/* slow, sparse orange pulse */}
      <Line
        ref={lineRef}
        points={points}
        color={ACCENT}
        lineWidth={2}
        transparent
        opacity={0.7}
        dashed
        dashSize={0.35}
        gapSize={2.4}
      />
    </>
  );
}

/* ─────────── Scene ─────────── */

function Scene({ isMobile }: { isMobile: boolean }) {
  const positions = isMobile
    ? {
        SEC: [0.8, 3.8, 0] as V3,
        FE: [0.8, 1.2, 0] as V3,
        BE: [0.8, -1.4, 0] as V3,
        DB: [0.8, -4.0, 0] as V3,
      }
    : {
        SEC: [-5.4, 0.2, 0] as V3,
        FE: [-1.8, 0.1, 0] as V3,
        BE: [1.8, 0.5, 0] as V3,
        DB: [5.4, 0.1, 0] as V3,
      };

  const edges = [
    { from: positions.SEC, to: positions.FE },
    { from: positions.FE, to: positions.BE },
    { from: positions.BE, to: positions.DB },
  ];

  return (
    <>
      <ambientLight intensity={0.9} />
      <directionalLight position={[6, 9, 4]} intensity={1.3} color="#ffffff" />
      <directionalLight position={[-4, 5, -4]} intensity={0.45} color={ACCENT} />
      <pointLight position={[0, 6, 6]} intensity={0.5} color="#ffffff" />

      <SecurityBox position={positions.SEC} />
      <Monitor position={positions.FE} />
      <ServerRack position={positions.BE} />
      <Database position={positions.DB} />

      {[
        { p: positions.SEC, dy: 1.3, label: "Security", sub: "TLS · JWT" },
        { p: positions.FE, dy: 1.5, label: "Frontend", sub: "React · Vite" },
        { p: positions.BE, dy: 1.6, label: "Backend", sub: "Hono · Node" },
        { p: positions.DB, dy: 1.2, label: "Database", sub: "Postgres 16" },
      ].map((n) => {
        // Desktop: label above node, centered. Mobile: label to the left of node, right-aligned.
        const pos: V3 = isMobile
          ? [n.p[0] - 1.5, n.p[1] + 0.1, n.p[2]]
          : [n.p[0], n.p[1] + n.dy, n.p[2]];
        const anchor = isMobile ? "right" : "center";
        return (
          <Billboard key={n.label} position={pos}>
            <Text
              fontSize={0.28}
              color={FG}
              anchorX={anchor}
              anchorY="bottom"
              letterSpacing={-0.02}
            >
              {n.label}
            </Text>
            <Text
              position={[0, -0.06, 0]}
              fontSize={0.14}
              color={DIM}
              anchorX={anchor}
              anchorY="top"
              letterSpacing={0.08}
            >
              {n.sub}
            </Text>
          </Billboard>
        );
      })}

      {edges.map((e, i) => (
        <CircuitTrace
          key={i}
          from={e.from}
          to={e.to}
          vertical={isMobile}
        />
      ))}
    </>
  );
}

/* ─────────── Responsive wrapper ─────────── */

export default function InfrastructureDiagram() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return (
    <section className="relative w-full border-t border-border bg-background">
      <div className="max-w-6xl mx-auto px-6 pt-24 pb-8 text-center">
        <p className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground mb-3">
          Infrastructure
        </p>
        <h2 className="text-4xl lg:text-5xl font-semibold tracking-tight">
          Self-hosted, end-to-end.
        </h2>
        <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
          Every layer runs on our own VPS in Singapore. No third-party
          platforms between you and your data.
        </p>
      </div>
      <div className={isMobile ? "w-full h-[760px] pb-20" : "w-full h-[560px] lg:h-[640px] pb-16"}>
        <Suspense fallback={null}>
          <Canvas
            orthographic
            camera={{
              position: [9, 7, 10],
              zoom: isMobile ? 44 : 58,
              near: 0.1,
              far: 100,
            }}
            dpr={[1, 1.5]}
          >
            <Scene isMobile={isMobile} />
          </Canvas>
        </Suspense>
      </div>
    </section>
  );
}
