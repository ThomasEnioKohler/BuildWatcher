import { TrayIcon } from "@tauri-apps/api/tray";
import { Image } from "@tauri-apps/api/image";
import { Menu } from "@tauri-apps/api/menu";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import type { OverallStatus } from "./types";

const COLORS: Record<OverallStatus, { base: string; light: string }> = {
  green: { base: "#23a839", light: "#3ed158" },
  yellow: { base: "#e0a400", light: "#ffc226" },
  red: { base: "#d33a2f", light: "#f0655a" },
  gray: { base: "#6e7a85", light: "#93a0ab" },
};

let tray: TrayIcon | null = null;

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Zeichnet ein 32x32-Statusicon: farbiges Badge mit Status-Symbol
 *  (✓ grün, ✕ rot, ▶ gelb/laufend, – grau). */
async function makeIcon(status: OverallStatus): Promise<Image> {
  const size = 32;
  const { base, light } = COLORS[status];
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);

  // Badge mit dezentem Farbverlauf
  const grad = ctx.createLinearGradient(0, 2, 0, size - 2);
  grad.addColorStop(0, light);
  grad.addColorStop(1, base);
  ctx.fillStyle = grad;
  roundRect(ctx, 2, 2, size - 4, size - 4, 9);
  ctx.fill();

  // feine dunkle Kontur für Lesbarkeit auf hellen Menüleisten
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 1;
  roundRect(ctx, 2.5, 2.5, size - 5, size - 5, 8.5);
  ctx.stroke();

  // Status-Symbol in Weiß
  ctx.strokeStyle = "#ffffff";
  ctx.fillStyle = "#ffffff";
  ctx.lineWidth = 3.4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  switch (status) {
    case "green": // Häkchen
      ctx.moveTo(9.5, 16.5);
      ctx.lineTo(14, 21.5);
      ctx.lineTo(22.5, 10.5);
      ctx.stroke();
      break;
    case "red": // Kreuz
      ctx.moveTo(11, 11);
      ctx.lineTo(21, 21);
      ctx.moveTo(21, 11);
      ctx.lineTo(11, 21);
      ctx.stroke();
      break;
    case "yellow": // Play-Dreieck (Build läuft)
      ctx.moveTo(12.5, 10);
      ctx.lineTo(22.5, 16);
      ctx.lineTo(12.5, 22);
      ctx.closePath();
      ctx.fill();
      break;
    default: // Strich (keine Daten)
      ctx.moveTo(11, 16);
      ctx.lineTo(21, 16);
      ctx.stroke();
  }

  const data = ctx.getImageData(0, 0, size, size).data;
  return Image.new(Array.from(data), size, size);
}

async function showWindow() {
  const win = getCurrentWindow();
  await win.show();
  await win.unminimize();
  await win.setFocus();
}

export async function initTray() {
  if (tray) return;
  const menu = await Menu.new({
    items: [
      { id: "show", text: "BuildWatcher anzeigen", action: showWindow },
      { id: "quit", text: "Beenden", action: () => invoke("quit") },
    ],
  });
  tray = await TrayIcon.new({
    id: "buildwatcher",
    icon: await makeIcon("gray"),
    tooltip: "BuildWatcher – keine Daten",
    menu,
    showMenuOnLeftClick: false,
    action: (event) => {
      if (event.type === "Click" && event.button === "Left") showWindow();
    },
  });
}

export async function updateTray(status: OverallStatus, tooltip: string) {
  if (!tray) return;
  await tray.setIcon(await makeIcon(status));
  await tray.setTooltip(tooltip);
}
