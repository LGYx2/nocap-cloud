import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/fredoka/latin-700.css";
import "./styles.css";

// Copy buttons: <button data-copy="text to copy">.
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

const year = document.querySelector("[data-year]");
if (year) year.textContent = String(new Date().getFullYear());
