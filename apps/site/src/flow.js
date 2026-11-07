// The deploy graph on the home page: inputs on the left are wired into the app card in the
// middle, and each wire switches on a result on the right. Wires are drawn in an SVG layer
// from the positions of the port dots, so they follow the nodes when they are dragged.
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function initFlow(root) {
  const canvas = root.querySelector("[data-flow-canvas]");
  const svg = root.querySelector("[data-flow-wires]");
  const summary = root.querySelector("[data-flow-summary]");
  const keys = [...root.querySelectorAll("[data-flow-input]")].map((n) => n.dataset.flowInput);
  const connected = new Set();
  let timers = [];

  const port = (selector) => root.querySelector(selector);

  function centerOf(element) {
    const box = element.getBoundingClientRect();
    const base = canvas.getBoundingClientRect();
    return { x: box.left + box.width / 2 - base.left, y: box.top + box.height / 2 - base.top };
  }

  function curve(a, b) {
    const dx = Math.max(60, Math.abs(b.x - a.x) / 2);
    return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
  }

  function draw() {
    // Wires only make sense in the wide layout, where nodes are placed freely.
    if (getComputedStyle(svg).display === "none") return;
    const parts = [];
    for (const key of keys) {
      const on = connected.has(key);
      const from = port(`[data-port="in-${key}"]`);
      const left = port(`[data-port="hub-in-${key}"]`);
      const right = port(`[data-port="hub-out-${key}"]`);
      const to = port(`[data-port="out-${key}"]`);
      if (!from || !left || !right || !to) continue;
      const state = on ? "is-on" : "";
      parts.push(`<path class="wire ${state}" d="${curve(centerOf(from), centerOf(left))}" />`);
      parts.push(`<path class="wire ${state}" d="${curve(centerOf(right), centerOf(to))}" />`);
    }
    svg.innerHTML = parts.join("");
  }

  function render() {
    for (const key of keys) {
      const on = connected.has(key);
      for (const el of root.querySelectorAll(`[data-flow-key="${key}"]`)) {
        el.classList.toggle("is-on", on);
      }
    }
    const count = connected.size;
    if (summary) {
      summary.innerHTML =
        count === keys.length
          ? `<span class="size-1.5 rounded-full bg-foreground"></span>Live at https://meridian.example`
          : `<span class="pulse-dot size-1.5 rounded-full bg-foreground"></span>Waiting for inputs, ${count} of ${keys.length}`;
    }
    root.classList.toggle("is-complete", count === keys.length);
    draw();
  }

  function toggle(key) {
    if (connected.has(key)) connected.delete(key);
    else connected.add(key);
    render();
  }

  function clearTimers() {
    for (const timer of timers) clearTimeout(timer);
    timers = [];
  }

  root.querySelector("[data-flow-all]")?.addEventListener("click", () => {
    clearTimers();
    const missing = keys.filter((key) => !connected.has(key));
    missing.forEach((key, index) => {
      timers.push(
        setTimeout(
          () => {
            connected.add(key);
            render();
          },
          reduceMotion ? 0 : index * 450,
        ),
      );
    });
  });

  root.querySelector("[data-flow-reset]")?.addEventListener("click", () => {
    clearTimers();
    connected.clear();
    for (const node of root.querySelectorAll("[data-flow-node]")) {
      node.style.removeProperty("--x");
      node.style.removeProperty("--y");
    }
    render();
  });

  for (const button of root.querySelectorAll("[data-flow-toggle]")) {
    button.addEventListener("click", () => toggle(button.dataset.flowToggle));
  }

  // Drag a node by its handle. Positions are kept in pixels inside the canvas.
  for (const handle of root.querySelectorAll("[data-flow-handle]")) {
    const node = handle.closest("[data-flow-node]");
    handle.addEventListener("pointerdown", (event) => {
      if (getComputedStyle(svg).display === "none") return;
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      const base = canvas.getBoundingClientRect();
      const start = node.getBoundingClientRect();
      const offsetX = event.clientX - start.left;
      const offsetY = event.clientY - start.top;
      node.classList.add("is-dragging");
      const move = (e) => {
        const x = Math.min(Math.max(e.clientX - base.left - offsetX, 0), base.width - start.width);
        const y = Math.min(Math.max(e.clientY - base.top - offsetY, 0), base.height - start.height);
        node.style.setProperty("--x", `${x}px`);
        node.style.setProperty("--y", `${y}px`);
        draw();
      };
      const up = () => {
        node.classList.remove("is-dragging");
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
    });
  }

  new ResizeObserver(draw).observe(canvas);
  render();

  // Wire the first input on its own when the graph first comes into view, as a hint.
  const hint = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      hint.disconnect();
      if (connected.size === 0 && keys[0]) {
        timers.push(
          setTimeout(
            () => {
              connected.add(keys[0]);
              render();
            },
            reduceMotion ? 0 : 600,
          ),
        );
      }
    },
    { threshold: 0.4 },
  );
  hint.observe(root);
}
