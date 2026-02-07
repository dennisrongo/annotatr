import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface OverlayProps {
  windowLabel: string;
}

export default function Overlay({ windowLabel }: OverlayProps) {
  const [isDrawing, setIsDrawing] = useState(false);
  const [mouseCapture, setMouseCapture] = useState(false);

  useEffect(() => {
    // This overlay window is transparent and captures mouse events
    // when drawing mode is active

    const handleMouseDown = (e: MouseEvent) => {
      if (mouseCapture) {
        setIsDrawing(true);
        console.log("Drawing started at:", e.clientX, e.clientY);
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (isDrawing && mouseCapture) {
        console.log("Drawing at:", e.clientX, e.clientY);
      }
    };

    const handleMouseUp = () => {
      if (isDrawing) {
        setIsDrawing(false);
        console.log("Drawing ended");
      }
    };

    // Add event listeners for mouse capture
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDrawing, mouseCapture]);

  useEffect(() => {
    // Check initial mouse capture state
    invoke("get_overlay_state")
      .then((visible: boolean) => {
        if (visible) {
          invoke("enable_mouse_capture").then(() => {
            setMouseCapture(true);
          }).catch(console.error);
        }
      })
      .catch(console.error);
  }, []);

  // The overlay is transparent, so we don't render anything visible
  // It just captures mouse events
  return null;
}
