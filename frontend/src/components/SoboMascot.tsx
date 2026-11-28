"use client";

import { useEffect } from "react";
import { useRive, Layout, Fit, Alignment } from "@rive-app/react-canvas";

export default function SoboMascot({ className = "" }: { className?: string }) {
  const { rive, RiveComponent } = useRive({
    src: "/rive/sobo.riv",
    stateMachine: "State Machine 1",
    autoBind: true, // data binding (ViewModel) ni avtomatik ulaydi
    autoplay: true,
    layout: new Layout({ fit: Fit.Cover, alignment: Alignment.Center }),
  });

  useEffect(() => {
    if (!rive) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vmi = (rive as any).viewModelInstance;
    console.log(
      "Sobo viewModel properties:",
      vmi ? vmi.properties?.map((p: { name: string; type: string }) => `${p.name} (${p.type})`) : "ViewModel yo'q",
    );
  }, [rive]);

  return (
    <div
      aria-hidden="true"
      className={`overflow-hidden rounded-2xl border shadow-md ${className}`}
      onPointerEnter={() => console.log("Sobo: pointer enter")}
      onPointerDown={() => console.log("Sobo: pointer down")}
    >
      <RiveComponent />
    </div>
  );
}