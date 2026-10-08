import type { FlowerContent, MemoryContent, NoteContent, PhotoContent, PublicPetal, QuestionContent, SongContent } from "@/domain/types";
import { safeHttpUrl } from "@/domain/content";
import { AnswerClient } from "./Answer";
import { FlowerArt } from "./Flowers";
import { Surprise } from "./Surprise";

export function PetalView({ petal, preview = false }: { petal: PublicPetal; preview?: boolean }) {
  return (
    <article className="stack" aria-label={preview ? "Preview" : undefined}>
      {petal.type === "note" ? <NoteView content={petal.content as NoteContent} /> : null}
      {petal.type === "flower" ? <FlowerNote content={petal.content as FlowerContent} /> : null}
      {petal.type === "memory" ? <MemoryView content={petal.content as MemoryContent} /> : null}
      {petal.type === "photo" ? <PhotoView content={petal.content as PhotoContent} /> : null}
      {petal.type === "song" ? <SongView content={petal.content as SongContent} /> : null}
      {petal.type === "question" ? <QuestionView petal={petal} preview={preview} /> : null}
      {petal.type === "surprise" ? <Surprise content={petal.content as { kind: "hold" | "stars" | "seal"; message: string }} /> : null}
      {petal.response ? (
        <div className="paper-note">
          <p className="section-label">An answer</p>
          <p className="note-text">{petal.response.body}</p>
        </div>
      ) : null}
    </article>
  );
}

function NoteView({ content }: { content: NoteContent }) {
  return (
    <div className="paper-note">
      <p className="note-text">{content.text}</p>
    </div>
  );
}

function FlowerNote({ content }: { content: FlowerContent }) {
  return (
    <div className="stack">
      <div className="flower-wrap">
        <FlowerArt variety={content.variety} />
      </div>
      {content.note ? <p className="note-text">{content.note}</p> : <p className="hint">Nothing written inside. The flower is the whole gift.</p>}
    </div>
  );
}

function MemoryView({ content }: { content: MemoryContent }) {
  return (
    <div className="memory stack">
      <p className="section-label">{[content.date, content.place].filter(Boolean).join(" · ") || "A memory"}</p>
      <h2>{content.title}</h2>
      {content.mediaId ? <img src={`/api/media/${content.mediaId}`} alt="" /> : null}
      {content.text ? <p>{content.text}</p> : null}
    </div>
  );
}

function PhotoView({ content }: { content: PhotoContent }) {
  return (
    <figure className="photo-card">
      <img src={`/api/media/${content.mediaId}`} alt={content.caption || "A photo left for you"} />
      {content.caption ? <figcaption className="note-text">{content.caption}</figcaption> : null}
    </figure>
  );
}

function SongView({ content }: { content: SongContent }) {
  const href = content.url ? safeHttpUrl(content.url) : null;
  return (
    <div className="song stack">
      <p className="section-label">{content.artist || "A song"}</p>
      <h2>{content.title}</h2>
      {content.note ? <p>{content.note}</p> : null}
      {href ? (
        <a href={href} rel="noreferrer noopener">
          Listen
        </a>
      ) : null}
      {content.mediaId ? <audio controls preload="none" src={`/api/media/${content.mediaId}`} /> : null}
    </div>
  );
}

function QuestionView({ petal, preview }: { petal: PublicPetal; preview: boolean }) {
  const content = petal.content as QuestionContent;
  return (
    <div className="question stack">
      <p className="note-text">{content.prompt}</p>
      {content.senderNote ? <p className="hint">{content.senderNote}</p> : null}
      {!preview && !petal.fromYou && petal.status === "opened" && !petal.response ? <AnswerClient petalId={petal.id} /> : null}
      {!preview && !petal.fromYou && !petal.response ? <p className="hint">You can answer, or just leave it. Either is enough.</p> : null}
    </div>
  );
}
