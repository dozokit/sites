import { useEffect, useState } from "react";
import { api } from "../lib/api";

export type Palette = { paper: string; ink: string; accent: string; soft: string };
export type Style = { layout: string; palette?: Palette };
type Layout = { id: string; label: string; hint: string; palette: Palette; fonts: string };

let cache: Layout[] | null = null;
export function useLayouts() {
  const [list, setList] = useState<Layout[]>(cache ?? []);
  useEffect(() => {
    if (!cache) api<Layout[]>("/api/styles").then((l) => setList((cache = l)), () => {});
  }, []);
  return list;
}

const Swatch = ({ p }: { p: Palette }) => (
  <span className="swatch" aria-hidden="true">
    <i style={{ background: p.accent }} />
    <i style={{ background: p.ink }} />
    <i style={{ background: p.soft }} />
  </span>
);

// The page design and its colours. "Your colours" comes from the owner's old site when it was read.
export function StylePicker({ value, onChange, brand }: { value: Style; onChange: (s: Style) => void; brand?: Palette | null }) {
  const layouts = useLayouts();
  const palettes = [...(brand ? [{ id: "brand", label: "Your colours", p: brand }] : []), ...layouts.map((l) => ({ id: l.id, label: l.label, p: l.palette }))];
  const current = value.palette ?? layouts.find((l) => l.id === value.layout)?.palette;
  return (
    <div className="style-pick">
      <fieldset>
        <legend>Layout</legend>
        <div className="layouts">
          {layouts.map((l) => (
            <label key={l.id} className={`layout-card${value.layout === l.id ? " is-on" : ""}`}>
              <input type="radio" name="layout" checked={value.layout === l.id} onChange={() => onChange({ ...value, layout: l.id })} />
              <span className={`mini mini--${l.id}`} style={{ ["--a" as string]: (current ?? l.palette).accent, ["--s" as string]: (current ?? l.palette).soft, ["--i" as string]: (current ?? l.palette).ink }} aria-hidden="true">
                <b />
                <em />
                <u />
              </span>
              <strong>{l.label}</strong>
              <span className="help">{l.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Colours</legend>
        <div className="palettes">
          {palettes.map((o) => (
            <label key={o.id} className={`chip-check${current && current.accent === o.p.accent && current.ink === o.p.ink ? " is-on" : ""}`}>
              <input type="radio" name="palette" checked={Boolean(current && current.accent === o.p.accent && current.ink === o.p.ink)} onChange={() => onChange({ ...value, palette: o.p })} />
              <Swatch p={o.p} /> {o.label}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
