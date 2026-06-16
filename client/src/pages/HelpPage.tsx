import { HelpCircle } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";
import { getHelpContent, helpPageSections } from "../help/helpContent";

function TermList({ terms }: { terms?: readonly string[] }) {
  if (!terms?.length) return null;

  return (
    <div className="help-term-grid">
      {terms.map((termKey) => {
        const item = getHelpContent(termKey);
        if (!item) return null;
        return (
          <article className="help-term-card" key={item.key}>
            <h3>{item.title}</h3>
            <p>{item.description}</p>
            {item.fix ? <p className="help-term-fix">{item.fix}</p> : null}
          </article>
        );
      })}
    </div>
  );
}

export function HelpPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="מרכז הסברים"
        subtitle="הסבר מקצועי ופשוט על המושגים, המסכים והפעולות המרכזיים ב־Site Builder Hub."
        actions={<span className="badge badge-info"><HelpCircle size={13} />תיעוד פנימי</span>}
        helpKey="hub.overview"
      />

      <div className="help-page-intro">
        <p>
          המטרה של העמוד הזה היא להפוך את ה־Hub למובן: מה כל דבר אומר, למה הוא חשוב,
          מה אפשר לעשות איתו, ומה לבדוק כשמשהו נכשל.
        </p>
      </div>

      {helpPageSections.map((section) => (
        <SectionCard key={section.id} title={section.title} helpKey={section.terms?.[0] || "hub.overview"}>
          <div className="help-section" id={section.id}>
            {"paragraphs" in section && section.paragraphs?.length ? (
              <div className="help-copy">
                {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              </div>
            ) : null}
            {"bullets" in section && section.bullets?.length ? (
              <ul className="help-bullet-list">
                {section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
              </ul>
            ) : null}
            <TermList terms={"terms" in section ? section.terms : undefined} />
          </div>
        </SectionCard>
      ))}
    </div>
  );
}
