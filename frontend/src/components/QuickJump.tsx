import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { CV, EMAIL, GITHUB, LINKEDIN } from "../content/profile";
import { POSTS } from "../content/posts";
import { THEMES, type ThemeId } from "../lib/useTheme";
import Icon, { type IconName } from "./Icons";

/* Quick jump: Ctrl+K (or Cmd+K) from anywhere, or the button in the top bar.
 *
 * Built on <dialog> with showModal() rather than a positioned div. The browser
 * then does the hard parts itself: everything behind the dialog is inert, focus
 * cannot escape it, Escape closes it, and focus goes back to wherever it was
 * when the dialog opened. A hand-rolled overlay has to re-implement all four
 * and usually misses one.
 *
 * The list follows the ARIA combobox pattern: focus never leaves the input,
 * and the highlighted option is announced through aria-activedescendant. */

type Group = "Sections" | "Pages" | "Theme" | "Contact";

interface Command {
  id: string;
  group: Group;
  label: string;
  hint?: string | undefined;
  keywords?: string;
  icon: IconName;
  /* Receives `close` so a command can decide when the dialog goes away --
     copying the email keeps it open long enough to say it worked. */
  run: (close: () => void) => void;
}

const SECTIONS: Array<[string, string, string]> = [
  ["home", "Home", "top start intro"],
  ["about", "About", "bio story background"],
  ["journey", "Journey", "history timeline path"],
  ["experience", "Experience", "work job deloitte education degree"],
  ["skills", "Skills", "tools stack tech"],
  ["projects", "Projects", "work portfolio solaroptimate circuit breaker"],
  ["writing", "Writing", "blog posts articles"],
  ["contact", "Contact", "hire email reach"],
];

function download(href: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function matches(cmd: Command, words: string[]): boolean {
  const haystack = `${cmd.label} ${cmd.group} ${cmd.keywords ?? ""}`.toLowerCase();
  return words.every((w) => haystack.includes(w));
}

interface Props {
  open: boolean;
  setOpen: (open: boolean) => void;
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
}

export default function QuickJump({ open, setOpen, theme, setTheme }: Props) {
  const navigate = useNavigate();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);

  // Ctrl+K and Cmd+K toggle from anywhere, including from inside the dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  /* Closed synchronously, not just through state. The browser hands focus
     back to whatever had it before the dialog opened, and that focus can
     scroll the page; doing it here means the scroll to the chosen section,
     which runs after the next render, always wins.
     The search is cleared here rather than on open: cleared on open, the old
     text is still in the box for the first frame, and a fast typist's first
     keystrokes get appended to it. */
  const close = () => {
    dialogRef.current?.close();
    setOpen(false);
    setQuery("");
    setActive(0);
    setCopied(false);
  };

  const commands = useMemo<Command[]>(() => {
    const go = (to: string) => (done: () => void) => {
      done();
      navigate(to);
    };

    return [
      ...SECTIONS.map(([id, label, keywords]) => ({
        id: `section-${id}`,
        group: "Sections" as const,
        label,
        keywords,
        icon: "arrow-right" as const,
        run: go(`/#${id}`),
      })),
      {
        id: "page-infra",
        group: "Pages",
        label: "Infrastructure",
        hint: "Live pods, deploys and cost",
        keywords: "kubernetes console live status",
        icon: "arrow-right",
        run: go("/infrastructure"),
      },
      {
        id: "page-blog",
        group: "Pages",
        label: "All writing",
        keywords: "blog posts articles",
        icon: "arrow-right",
        run: go("/blog"),
      },
      ...POSTS.map((post) => ({
        id: `post-${post.slug}`,
        group: "Pages" as const,
        label: post.title,
        hint: `${post.readingMinutes} min read`,
        keywords: `blog post ${post.tags.join(" ")}`,
        icon: "arrow-right" as const,
        run: go(`/blog/${post.slug}`),
      })),
      ...THEMES.map((t) => ({
        id: `theme-${t.id}`,
        group: "Theme" as const,
        label: `${t.label} theme`,
        hint: t.id === theme ? "Current" : t.hint,
        keywords: "colour color mode appearance",
        icon: "contrast" as const,
        run: (done: () => void) => {
          setTheme(t.id);
          done();
        },
      })),
      {
        id: "cv",
        group: "Contact",
        label: "Download CV",
        hint: "PDF",
        keywords: "resume résumé",
        icon: "download",
        run: (done) => {
          download(CV);
          done();
        },
      },
      {
        id: "email",
        group: "Contact",
        label: "Email me",
        hint: EMAIL,
        keywords: "mail hire contact",
        icon: "mail",
        run: (done) => {
          done();
          window.location.href = `mailto:${EMAIL}`;
        },
      },
      {
        id: "copy-email",
        group: "Contact",
        label: "Copy email address",
        hint: copied ? "Copied" : undefined,
        keywords: "clipboard mail",
        icon: "mail",
        run: (done) => {
          // No clipboard outside a secure context; nothing to wait for then.
          if (!navigator.clipboard) return done();
          void navigator.clipboard
            .writeText(EMAIL)
            .then(() => {
              setCopied(true);
              window.setTimeout(done, 900);
            })
            .catch(done);
        },
      },
      {
        id: "github",
        group: "Contact",
        label: "GitHub",
        hint: "github.com/animesh-samal",
        keywords: "code repositories source",
        icon: "github",
        run: (done) => {
          done();
          window.location.assign(GITHUB);
        },
      },
      {
        id: "linkedin",
        group: "Contact",
        label: "LinkedIn",
        keywords: "profile network",
        icon: "linkedin",
        run: (done) => {
          done();
          window.location.assign(LINKEDIN);
        },
      },
    ];
  }, [navigate, setTheme, theme, copied]);

  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const results = words.length ? commands.filter((c) => matches(c, words)) : commands;
  const current = results[Math.min(active, results.length - 1)];

  // Keep the highlighted option in view while arrowing through a long list.
  useEffect(() => {
    if (!current) return;
    document.getElementById(`qj-${current.id}`)?.scrollIntoView({ block: "nearest" });
  }, [current]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (results.length === 0) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (Math.min(i, results.length - 1) + step + results.length) % results.length);
    } else if (e.key === "Enter" && current) {
      e.preventDefault();
      current.run(close);
    }
  }

  let lastGroup: Group | null = null;

  return (
    <dialog
      ref={dialogRef}
      className="qj"
      aria-label="Quick jump"
      onClose={close}
      // A click that lands on the dialog element itself, rather than on the
      // panel inside it, is a click on the backdrop.
      onClick={(e) => e.target === dialogRef.current && close()}
    >
      <div className="qj-panel">
        <div className="qj-search">
          <Icon name="search" size={18} />
          <input
            className="qj-input"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="qj-list"
            aria-autocomplete="list"
            aria-activedescendant={current ? `qj-${current.id}` : undefined}
            placeholder="Where do you want to go?"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
          />
          <kbd className="kbd">Esc</kbd>
        </div>

        <ul id="qj-list" className="qj-list" role="listbox" aria-label="Results">
          {results.map((cmd) => {
            const heading = cmd.group !== lastGroup ? cmd.group : null;
            lastGroup = cmd.group;
            const selected = cmd === current;
            return (
              <li key={cmd.id} role="presentation">
                {heading && (
                  <div className="qj-group" aria-hidden="true">
                    {heading}
                  </div>
                )}
                <div
                  id={`qj-${cmd.id}`}
                  role="option"
                  aria-selected={selected}
                  className={`qj-option${selected ? " is-active" : ""}`}
                  onMouseMove={() => {
                    const i = results.indexOf(cmd);
                    if (i !== active) setActive(i);
                  }}
                  onClick={() => cmd.run(close)}
                >
                  <span className="qj-icon">
                    <Icon name={cmd.icon} size={15} />
                  </span>
                  <span className="qj-label">{cmd.label}</span>
                  {cmd.hint && <span className="qj-hint">{cmd.hint}</span>}
                </div>
              </li>
            );
          })}
        </ul>

        {results.length === 0 && (
          <p className="qj-empty">
            Nothing matches &ldquo;{query}&rdquo;. Try &ldquo;cv&rdquo;, &ldquo;projects&rdquo; or
            &ldquo;light&rdquo;.
          </p>
        )}

        <div className="qj-foot" aria-hidden="true">
          <span>
            <kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd> to move
          </span>
          <span>
            <kbd className="kbd">Enter</kbd> to open
          </span>
          <span>
            <kbd className="kbd">Esc</kbd> to close
          </span>
        </div>
      </div>
    </dialog>
  );
}
