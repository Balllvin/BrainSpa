import { useEffect, useRef } from "react";

import { mountReactor3D } from "@/lib/reactor-draft-i";

type ChipmunkReactorProps = {
  intensity?: "idle" | "active";
};

export function ChipmunkReactor({ intensity = "idle" }: ChipmunkReactorProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const reactorRef = useRef<ReturnType<typeof mountReactor3D> | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reactor = mountReactor3D(mount);
    reactorRef.current = reactor;
    return () => {
      reactor.destroy();
      reactorRef.current = null;
    };
  }, []);

  useEffect(() => {
    reactorRef.current?.setActive(intensity === "active");
  }, [intensity]);

  return <div className="reactor-3d" ref={mountRef} />;
}
