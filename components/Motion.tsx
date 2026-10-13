"use client";
import { usePathname } from "next/navigation";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP, ScrollTrigger);

// Page-level GSAP animations. Everything is server-rendered visible first; animations only run
// once JS is ready, re-run on each navigation, and are skipped for prefers-reduced-motion.
const REVEAL = [
  ".card",
  ".change",
  ".charts > .panel",
  ".grid2 > .panel",
  ".table-wrap",
  ".callout",
  ".timeline .tl-item",
  ".list > .panel",
  ".add-form",
].join(", ");

export default function Motion() {
  const path = usePathname();

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      // Header and stat cards
      gsap.from(".page-head > *", { y: 18, autoAlpha: 0, duration: 0.55, stagger: 0.08, ease: "power3.out" });
      gsap.from(".stats .stat", { y: 26, autoAlpha: 0, scale: 0.95, duration: 0.7, stagger: 0.09, ease: "back.out(1.5)", delay: 0.1 });
      gsap.from(".stats .stat .ico", { rotate: -25, scale: 0.4, autoAlpha: 0, duration: 0.6, stagger: 0.09, ease: "back.out(2)", delay: 0.35 });
      gsap.from(".stats .stat .cta", { y: 8, autoAlpha: 0, duration: 0.45, stagger: 0.09, ease: "power2.out", delay: 0.6 });

      // Count the stat numbers up from zero
      document.querySelectorAll<HTMLElement>(".stats .stat .n").forEach((el) => {
        const target = Number(el.textContent?.trim());
        if (!Number.isInteger(target) || target <= 0) return;
        const o = { v: 0 };
        gsap.to(o, {
          v: target,
          duration: 1.2,
          delay: 0.2,
          ease: "power2.out",
          onUpdate: () => { el.textContent = String(Math.round(o.v)); },
        });
      });

      // Charts: grow the bars, draw the donut
      gsap.from(".bar-rect", { scaleY: 0, transformOrigin: "50% 100%", duration: 0.9, stagger: 0.04, ease: "power3.out", delay: 0.35 });
      gsap.from(".bar-label", { autoAlpha: 0, y: 6, duration: 0.4, stagger: 0.04, delay: 0.9 });
      document.querySelectorAll<SVGCircleElement>(".donut-arc").forEach((el, i) => {
        const final = el.getAttribute("stroke-dasharray") ?? "";
        const circumference = final.split(" ")[1];
        if (!circumference) return;
        gsap.fromTo(
          el,
          { attr: { "stroke-dasharray": `0 ${circumference}` } },
          { attr: { "stroke-dasharray": final }, duration: 1.1, delay: 0.4 + i * 0.15, ease: "power2.out" },
        );
      });
      gsap.from(".donut-legend > div", { y: 10, autoAlpha: 0, duration: 0.5, stagger: 0.08, delay: 0.8, ease: "power2.out" });

      // Everything else fades up as it scrolls into view
      const items = gsap.utils.toArray<HTMLElement>(REVEAL);
      gsap.set(items, { autoAlpha: 0, y: 26 });
      ScrollTrigger.batch(items, {
        start: "top 94%",
        once: true,
        onEnter: (batch) => gsap.to(batch, { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.07, ease: "power2.out", overwrite: true, clearProps: "transform" }),
      });
      // Safety net: anything still hidden after 2.5 s (e.g. no scroll events) is shown.
      gsap.delayedCall(2.5, () => {
        items.forEach((el) => { if (Number(gsap.getProperty(el, "autoAlpha")) === 0 && el.getBoundingClientRect().top < window.innerHeight) gsap.to(el, { autoAlpha: 1, y: 0, duration: 0.4 }); });
      });

      // Score-breakdown bars fill when opened
      document.querySelectorAll("details.bd").forEach((d) =>
        d.addEventListener("toggle", () => {
          if ((d as HTMLDetailsElement).open) gsap.from(d.querySelectorAll(".bar > i"), { width: 0, duration: 0.7, stagger: 0.06, ease: "power2.out" });
        }),
      );

      ScrollTrigger.refresh();
    },
    { dependencies: [path], revertOnUpdate: true },
  );

  // Sidebar entrance, once
  useGSAP(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.from(".side", { x: -30, autoAlpha: 0, duration: 0.6, ease: "power3.out" });
    gsap.from(".brand-mark", { scale: 0.3, rotate: -90, duration: 0.8, ease: "back.out(1.8)", delay: 0.15 });
    gsap.from(".nav a", { x: -16, autoAlpha: 0, duration: 0.4, stagger: 0.05, ease: "power2.out", delay: 0.25 });
  }, []);

  return null;
}
