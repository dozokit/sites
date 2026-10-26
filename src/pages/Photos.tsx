import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { listPhotos, uploadPhoto, type Photo } from "../lib/photos";

const FROM: Record<string, string> = { upload: "Uploaded", website: "From your old site", page: "On the page" };

// Drop zone and file button: several photos at once, uploaded one after the other.
function Uploader({ siteId, onDone }: { siteId: number; onDone: (p: Photo[], id: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const send = async (files: File[]) => {
    setError(null);
    for (const [i, f] of files.filter((f) => f.type.startsWith("image/")).entries()) {
      setBusy(`Adding ${i + 1} of ${files.length}…`);
      try {
        const out = await uploadPhoto(siteId, f);
        onDone(out.photos, out.id);
      } catch (err) {
        setError((err as Error).message);
      }
    }
    setBusy(null);
  };
  return (
    <div
      className={`dropzone${over ? " is-over" : ""}`}
      onDragOver={(e) => (e.preventDefault(), setOver(true))}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => (e.preventDefault(), setOver(false), send(Array.from(e.dataTransfer.files)))}
    >
      <p>{busy ?? "Drop photos here, or"}</p>
      <label className="btn btn--ink">
        Choose photos
        <input type="file" accept="image/*" multiple hidden onChange={(e) => send(Array.from(e.target.files ?? []))} />
      </label>
      <p className={error ? "help help--error" : "help"}>{error ?? "JPG, PNG or WebP. They're resized for the web as they upload."}</p>
    </div>
  );
}

// The site's photo library, like WordPress's media library.
export function Photos({ siteId }: { siteId: number }) {
  const [list, setList] = useState<Photo[] | null>(null);
  const [open, setOpen] = useState<Photo | null>(null);
  const [alt, setAlt] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    listPhotos(siteId).then(setList, (e: Error) => setMsg(e.message));
  }, [siteId]);
  const pick = (p: Photo) => (setOpen(p), setAlt(p.alt), setMsg(null));

  return (
    <section className="page-section">
      <h2>Your photos</h2>
      <p className="lead">Upload as many as you like, then use them anywhere on your site: click a photo on the page in the editor and choose one. The description tells Google and screen readers what the photo shows.</p>
      <Uploader siteId={siteId} onDone={(p) => setList(p)} />
      {list && !list.length && <p className="muted">No photo yet.</p>}
      <ul className="library">
        {list?.map((p) => (
          <li key={p.id}>
            <button type="button" className={`lib-photo${open?.id === p.id ? " is-on" : ""}`} onClick={() => pick(p)} aria-label={p.alt || "Photo without a description"}>
              <img src={`/img/${p.id}`} alt="" loading="lazy" />
              <span className="lib-meta">{p.used ? "On the page" : FROM[p.source] ?? p.source}{!p.alt && " · no description"}</span>
            </button>
          </li>
        ))}
      </ul>
      {open && (
        <div className="modal-back" onClick={() => setOpen(null)}>
          <section className="modal stock" role="dialog" aria-modal="true" aria-label="Photo" onClick={(e) => e.stopPropagation()}>
            <img src={`/img/${open.id}`} alt="" className="lib-big" />
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setList(await api<Photo[]>(`/api/sites/${siteId}/photo`, { method: "PUT", body: JSON.stringify({ id: open.id, alt }) }));
                setMsg("Saved.");
              }}
            >
              <label className="field">
                <span>What it shows (for Google and screen readers)</span>
                <input value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="Wedding bouquet of white roses on the shop counter" />
              </label>
              <div className="pop-actions">
                <button className="btn btn--ink" type="submit">Save</button>
                <button
                  className="btn btn--quiet"
                  type="button"
                  onClick={async () => {
                    try {
                      setList(await api<Photo[]>(`/api/sites/${siteId}/photo`, { method: "DELETE", body: JSON.stringify({ id: open.id }) }));
                      setOpen(null);
                    } catch (err) {
                      setMsg((err as Error).message);
                    }
                  }}
                >
                  Delete
                </button>
                <button className="btn btn--quiet" type="button" onClick={() => setOpen(null)}>Close</button>
              </div>
              <p className="help" role="status">{msg ?? (open.used ? "Your page uses this photo." : "")}</p>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}

// The editor's chooser: pick from the library, or upload one and use it at once.
export function PhotoPicker({ siteId, onPick, onClose }: { siteId: number; onPick: (id: string) => void; onClose: () => void }) {
  const [list, setList] = useState<Photo[] | null>(null);
  useEffect(() => {
    listPhotos(siteId).then(setList, () => setList([]));
  }, [siteId]);
  return (
    <div className="modal-back" onClick={onClose}>
      <section className="modal modal--wide stock" role="dialog" aria-modal="true" aria-labelledby="pick-h" onClick={(e) => e.stopPropagation()}>
        <h2 id="pick-h">Choose a photo</h2>
        <Uploader siteId={siteId} onDone={(_p, id) => onPick(id)} />
        <ul className="library library--pick">
          {list?.map((p) => (
            <li key={p.id}>
              <button type="button" className="lib-photo" onClick={() => onPick(p.id)} aria-label={p.alt || "Photo"}>
                <img src={`/img/${p.id}`} alt="" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
        <div className="pop-actions">
          <button className="btn btn--quiet" type="button" onClick={onClose}>Cancel</button>
        </div>
      </section>
    </div>
  );
}
