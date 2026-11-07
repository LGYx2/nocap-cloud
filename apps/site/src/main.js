import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/fredoka/latin-700.css";
import "./styles.css";

// Scroll animations only hide content once this script runs, so the site still reads without it.
document.documentElement.classList.add("js");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------------------------------------------------------------- current page in the nav
const page = document.body.dataset.page;
for (const link of document.querySelectorAll(`[data-nav="${page}"]`)) {
  link.setAttribute("aria-current", "page");
}
for (const link of document.querySelectorAll(".mobile-link[href]")) {
  const target = new URL(link.href, window.location.href).pathname.replace(/\.html$/, "");
  const here = window.location.pathname.replace(/\.html$/, "");
  if (target === here) link.setAttribute("aria-current", "page");
}

// Close the mobile menu after picking a link.
for (const menu of document.querySelectorAll(".mobile-menu")) {
  menu.addEventListener("click", (event) => {
    if (event.target instanceof HTMLAnchorElement) menu.removeAttribute("open");
  });
}

// ---------------------------------------------------------------- copy buttons
for (const button of document.querySelectorAll("[data-copy]")) {
  const label = button.querySelector("[data-copy-label]");
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copy ?? "");
      if (label) label.textContent = "Copied";
    } catch {
      if (label) label.textContent = "Select and copy";
    }
    setTimeout(() => {
      if (label) label.textContent = "Copy";
    }, 2000);
  });
}

// ---------------------------------------------------------------- reveal on scroll
const revealed = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("is-visible");
      revealed.unobserve(entry.target);
      if (entry.target.matches("[data-terminal]")) playTerminal(entry.target);
    }
  },
  { rootMargin: "0px 0px -10% 0px", threshold: 0.12 },
);
for (const element of document.querySelectorAll("[data-reveal], .tilt-in, [data-terminal]")) {
  revealed.observe(element);
}

// Children of [data-stagger] reveal one after the other.
for (const group of document.querySelectorAll("[data-stagger]")) {
  [...group.children].forEach((child, index) => {
    child.setAttribute("data-reveal", "");
    child.style.setProperty("--i", String(index));
    revealed.observe(child);
  });
}

// ---------------------------------------------------------------- pointer spotlight on cards
if (!reduceMotion) {
  document.addEventListener("pointermove", (event) => {
    const card = event.target instanceof Element ? event.target.closest(".spotlight") : null;
    if (!(card instanceof HTMLElement)) return;
    const box = card.getBoundingClientRect();
    card.style.setProperty("--x", `${event.clientX - box.left}px`);
    card.style.setProperty("--y", `${event.clientY - box.top}px`);
  });
}

// ---------------------------------------------------------------- terminal playback
function playTerminal(terminal) {
  const lines = [...terminal.querySelectorAll(".term-line")];
  if (reduceMotion) {
    for (const line of lines) line.classList.add("is-shown");
    return;
  }
  lines.forEach((line, index) => {
    const delay = Number(line.dataset.delay ?? index * 450);
    setTimeout(() => line.classList.add("is-shown"), delay);
  });
}

// ---------------------------------------------------------------- page-specific scripts
const flow = document.querySelector("[data-flow]");
if (flow) void import("./flow.js").then(({ initFlow }) => initFlow(flow));
if (document.querySelector("[data-ideas], [data-contributors]")) void import("./community.js");

// ---------------------------------------------------------------- footer year
for (const year of document.querySelectorAll("[data-year]")) {
  year.textContent = String(new Date().getFullYear());
}
