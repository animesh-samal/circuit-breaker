import { useState } from "react";

import type {
  AvailabilityRow,
  Education,
  Job,
  JourneyStop,
  SiteProject,
  SkillGroup,
  Stat,
} from "../../content/site";
import {
  AddButton,
  arrayMove,
  Check,
  ChipsInput,
  RowButtons,
  StringList,
  TextArea,
  TextInput,
} from "./fields";

/* The editors. Each takes the part of the content it owns and reports a new copy
   on every change; the page above holds the draft and does the saving. None of
   them knows about the network. */

interface EditorProps<T> {
  value: T;
  onChange: (value: T) => void;
}

const replaceAt = <T,>(list: T[], index: number, item: T): T[] => list.map((x, i) => (i === index ? item : x));

/* ---------------------------------------------------------------------------
   Projects
   --------------------------------------------------------------------------- */

const MAX_PROJECTS = 40;

function newProjectId(existing: SiteProject[]): string {
  const taken = new Set(existing.map((p) => p.id));
  let n = 1;
  while (taken.has(`new-project-${n}`)) n++;
  return `new-project-${n}`;
}

export function ProjectsEditor({ value: projects, onChange }: EditorProps<SiteProject[]>) {
  const [open, setOpen] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const update = (id: string, patch: Partial<SiteProject>) =>
    onChange(projects.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const add = () => {
    const id = newProjectId(projects);
    onChange([
      ...projects,
      { id, tag: `${String(projects.length + 1).padStart(2, "0")} · New`, title: "New project", blurb: "", flow: "", stack: [] },
    ]);
    setOpen(id);
  };

  return (
    <div className="adm-stack">
      <p className="adm-lead">
        Order here is the order on the site. A hidden project stays here but is not shown. Each of the first four shown
        also gets a card in the home page tunnel.
      </p>

      {projects.length === 0 && <p className="adm-empty">No projects yet. Add the first one.</p>}

      {projects.map((p, i) => (
        <article className={`adm-card${p.hidden ? " is-hidden" : ""}`} key={p.id}>
          <header className="adm-card-head">
            <div>
              <h3>{p.title || "Untitled"}</h3>
              <p className="adm-sub">
                {p.tag}
                {p.hidden && <span className="adm-pill">Hidden</span>}
              </p>
            </div>
            <div className="adm-card-actions">
              <button type="button" className="adm-mini" onClick={() => setOpen(open === p.id ? null : p.id)} aria-expanded={open === p.id}>
                {open === p.id ? "Close" : "Edit"}
              </button>
              <button type="button" className="adm-mini" onClick={() => update(p.id, { hidden: !p.hidden })}>
                {p.hidden ? "Show" : "Hide"}
              </button>
              <button type="button" className="adm-mini" disabled={i === 0} onClick={() => onChange(arrayMove(projects, i, i - 1))} aria-label={`Move ${p.title} up`}>
                ↑
              </button>
              <button
                type="button"
                className="adm-mini"
                disabled={i === projects.length - 1}
                onClick={() => onChange(arrayMove(projects, i, i + 1))}
                aria-label={`Move ${p.title} down`}
              >
                ↓
              </button>
              {confirming === p.id ? (
                <>
                  <button
                    type="button"
                    className="adm-mini adm-mini--danger"
                    onClick={() => {
                      onChange(projects.filter((x) => x.id !== p.id));
                      setConfirming(null);
                    }}
                  >
                    Yes, delete
                  </button>
                  <button type="button" className="adm-mini" onClick={() => setConfirming(null)}>
                    Keep
                  </button>
                </>
              ) : (
                <button type="button" className="adm-mini adm-mini--danger" onClick={() => setConfirming(p.id)}>
                  Delete
                </button>
              )}
            </div>
          </header>

          {open === p.id && (
            <div className="adm-form">
              <TextInput label="Title" value={p.title} max={60} required onChange={(v) => update(p.id, { title: v })} />
              <TextInput
                label="Label"
                value={p.tag}
                max={60}
                hint="The small line above the title, such as “03 · Side project”."
                onChange={(v) => update(p.id, { tag: v })}
              />
              <TextArea label="Description" value={p.blurb} max={1500} rows={5} onChange={(v) => update(p.id, { blurb: v })} />
              <TextInput
                label="One-line summary"
                value={p.tagline ?? ""}
                max={90}
                hint="Shown on the tunnel card. If empty, the start of the description is used."
                onChange={(v) => update(p.id, { tagline: v })}
              />
              <TextInput
                label="How it works, in one line"
                value={p.flow ?? ""}
                max={240}
                hint="Optional. For example: git tag → build → deploy."
                onChange={(v) => update(p.id, { flow: v })}
              />
              <TextArea label="Extra detail" value={p.extra ?? ""} max={1500} rows={3} onChange={(v) => update(p.id, { extra: v })} />
              <ChipsInput label="Tools used" values={p.stack} onChange={(v) => update(p.id, { stack: v })} />
              <TextInput
                label="Source link"
                value={p.source ?? ""}
                max={300}
                placeholder="https://github.com/..."
                hint="Must start with https://"
                onChange={(v) => update(p.id, { source: v })}
              />
              <TextInput
                label="Live link"
                value={p.live ?? ""}
                max={300}
                placeholder="https://... or /infrastructure"
                hint="A full https:// address, or a page on this site such as /infrastructure."
                onChange={(v) => update(p.id, { live: v })}
              />
            </div>
          )}
        </article>
      ))}

      <AddButton onClick={add} disabled={projects.length >= MAX_PROJECTS}>
        Add a project
      </AddButton>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   The numbers and the availability box
   --------------------------------------------------------------------------- */

export function ProfileEditor({
  availability,
  stats,
  onAvailability,
  onStats,
}: {
  availability: AvailabilityRow[];
  stats: Stat[];
  onAvailability: (rows: AvailabilityRow[]) => void;
  onStats: (stats: Stat[]) => void;
}) {
  return (
    <div className="adm-stack">
      <fieldset className="adm-group">
        <legend>Availability box</legend>
        <p className="adm-lead">Shown next to the contact details. Tick “Available” for the green dot.</p>
        {availability.map((row, i) => (
          <div className="adm-list-row adm-list-row--wide" key={i}>
            <div className="adm-inline">
              <TextInput label="Label" value={row.label} max={40} onChange={(v) => onAvailability(replaceAt(availability, i, { ...row, label: v }))} />
              <TextInput label="Value" value={row.value} max={200} onChange={(v) => onAvailability(replaceAt(availability, i, { ...row, value: v }))} />
              <Check label="Available" checked={Boolean(row.ok)} onChange={(v) => onAvailability(replaceAt(availability, i, { ...row, ok: v }))} />
            </div>
            <RowButtons
              index={i}
              count={availability.length}
              noun={`row ${i + 1}`}
              onMove={(from, to) => onAvailability(arrayMove(availability, from, to))}
              onRemove={() => onAvailability(availability.filter((_, j) => j !== i))}
            />
          </div>
        ))}
        <AddButton disabled={availability.length >= 8} onClick={() => onAvailability([...availability, { label: "", value: "" }])}>
          Add a row
        </AddButton>
      </fieldset>

      <fieldset className="adm-group">
        <legend>Numbers</legend>
        <p className="adm-lead">
          The big figures in the About section. The first one is also shown large in the tunnel, so put the strongest first.
        </p>
        {stats.map((stat, i) => (
          <div className="adm-list-row adm-list-row--wide" key={i}>
            <div className="adm-inline">
              <TextInput label="Figure" value={stat.value} max={24} hint="For example: 20+" onChange={(v) => onStats(replaceAt(stats, i, { ...stat, value: v }))} />
              <TextInput label="What it measures" value={stat.label} max={200} onChange={(v) => onStats(replaceAt(stats, i, { ...stat, label: v }))} />
            </div>
            <RowButtons
              index={i}
              count={stats.length}
              noun={`number ${i + 1}`}
              onMove={(from, to) => onStats(arrayMove(stats, from, to))}
              onRemove={() => onStats(stats.filter((_, j) => j !== i))}
            />
          </div>
        ))}
        <AddButton disabled={stats.length >= 8} onClick={() => onStats([...stats, { value: "", label: "" }])}>
          Add a number
        </AddButton>
      </fieldset>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Experience and education
   --------------------------------------------------------------------------- */

export function ExperienceEditor({
  job,
  education,
  onJob,
  onEducation,
}: {
  job: Job;
  education: Education;
  onJob: (job: Job) => void;
  onEducation: (education: Education) => void;
}) {
  return (
    <div className="adm-stack">
      <fieldset className="adm-group">
        <legend>Work</legend>
        <div className="adm-form">
          <TextInput label="Company" value={job.company} max={200} onChange={(v) => onJob({ ...job, company: v })} />
          <TextInput label="Role" value={job.role} max={200} onChange={(v) => onJob({ ...job, role: v })} />
          <TextInput label="Dates" value={job.dates} max={60} hint="For example: Oct 2024 — present" onChange={(v) => onJob({ ...job, dates: v })} />
          <StringList label="What I did" noun="Point" values={job.points} max={12} onChange={(points) => onJob({ ...job, points })} />
          <ChipsInput label="Tools" values={job.stack} onChange={(stack) => onJob({ ...job, stack })} />
        </div>
      </fieldset>

      <fieldset className="adm-group">
        <legend>Education</legend>
        <div className="adm-form">
          <TextInput label="Degree" value={education.degree} max={200} onChange={(v) => onEducation({ ...education, degree: v })} />
          <TextInput label="School" value={education.school} max={200} onChange={(v) => onEducation({ ...education, school: v })} />
          <TextInput label="Detail" value={education.detail} max={200} hint="For example: CGPA 8.73/10" onChange={(v) => onEducation({ ...education, detail: v })} />
          <TextInput label="Years" value={education.years} max={60} onChange={(v) => onEducation({ ...education, years: v })} />
        </div>
      </fieldset>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Skills
   --------------------------------------------------------------------------- */

export function SkillsEditor({ value: groups, onChange }: EditorProps<SkillGroup[]>) {
  return (
    <div className="adm-stack">
      <p className="adm-lead">Groups of tools, shown as cards in the Skills section.</p>
      {groups.map((group, i) => (
        <article className="adm-card" key={i}>
          <div className="adm-list-row adm-list-row--wide">
            <div className="adm-form">
              <TextInput label="Group name" value={group.title} max={60} onChange={(v) => onChange(replaceAt(groups, i, { ...group, title: v }))} />
              <ChipsInput label="Tools in this group" values={group.items} onChange={(items) => onChange(replaceAt(groups, i, { ...group, items }))} />
            </div>
            <RowButtons
              index={i}
              count={groups.length}
              noun={`group ${i + 1}`}
              onMove={(from, to) => onChange(arrayMove(groups, from, to))}
              onRemove={() => onChange(groups.filter((_, j) => j !== i))}
            />
          </div>
        </article>
      ))}
      <AddButton disabled={groups.length >= 14} onClick={() => onChange([...groups, { title: "", items: [] }])}>
        Add a group
      </AddButton>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Journey
   --------------------------------------------------------------------------- */

const ICONS: Array<{ value: JourneyStop["icon"]; label: string }> = [
  { value: "cap", label: "Graduation cap" },
  { value: "chart", label: "Chart" },
  { value: "briefcase", label: "Briefcase" },
  { value: "branch", label: "Branches" },
  { value: "server", label: "Server" },
  { value: "flag", label: "Flag" },
];

export function JourneyEditor({ value: stops, onChange }: EditorProps<JourneyStop[]>) {
  const update = (i: number, patch: Partial<JourneyStop>) => onChange(replaceAt(stops, i, { ...stops[i]!, ...patch }));

  return (
    <div className="adm-stack">
      <p className="adm-lead">The stops on the journey map, in order. Mark one as “Now” for the pulsing dot.</p>
      {stops.map((stop, i) => (
        <article className="adm-card" key={i}>
          <div className="adm-list-row adm-list-row--wide">
            <div className="adm-form">
              <div className="adm-inline">
                <TextInput label="When" value={stop.when} max={60} hint="For example: 2020, or Oct 2024" onChange={(v) => update(i, { when: v })} />
                <TextInput label="Title" value={stop.title} max={200} onChange={(v) => update(i, { title: v })} />
              </div>
              <TextInput label="Place" value={stop.place} max={200} onChange={(v) => update(i, { place: v })} />
              <TextArea label="What happened" value={stop.text} max={1500} rows={3} onChange={(v) => update(i, { text: v })} />
              <div className="adm-inline">
                <label className="adm-select">
                  <span>Icon</span>
                  <select value={stop.icon} onChange={(e) => update(i, { icon: e.target.value as JourneyStop["icon"] })}>
                    {ICONS.map((icon) => (
                      <option key={icon.value} value={icon.value}>
                        {icon.label}
                      </option>
                    ))}
                  </select>
                </label>
                <Check label="This is where I am now" checked={Boolean(stop.now)} onChange={(v) => update(i, { now: v })} />
              </div>
              <div className="adm-inline">
                <TextInput
                  label="Figure (optional)"
                  value={stop.stat?.value ?? ""}
                  max={24}
                  onChange={(v) => update(i, { stat: { value: v, label: stop.stat?.label ?? "" } })}
                />
                <TextInput
                  label="What it measures (optional)"
                  value={stop.stat?.label ?? ""}
                  max={200}
                  onChange={(v) => update(i, { stat: { value: stop.stat?.value ?? "", label: v } })}
                />
              </div>
              <ChipsInput label="Tags (optional)" values={stop.tags ?? []} onChange={(tags) => update(i, { tags })} />
            </div>
            <RowButtons
              index={i}
              count={stops.length}
              noun={`stop ${i + 1}`}
              canRemove={stops.length > 1}
              onMove={(from, to) => onChange(arrayMove(stops, from, to))}
              onRemove={() => onChange(stops.filter((_, j) => j !== i))}
            />
          </div>
        </article>
      ))}
      <AddButton
        disabled={stops.length >= 12}
        onClick={() => onChange([...stops, { when: "", title: "", place: "", text: "", icon: "flag" }])}
      >
        Add a stop
      </AddButton>
    </div>
  );
}
