import { PageHead } from "../components/SectionHead";

export default function Terminal() {
  return (
    <div className="container page">
      <PageHead
        eyebrow="Coming next"
        title="Terminal"
        lead={
          <>
            A real console over the same API &mdash; every command issues an
            actual request. Being built next.
          </>
        }
      />
    </div>
  );
}
