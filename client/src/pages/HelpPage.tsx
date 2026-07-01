import { HelpCircle } from "lucide-react";
import { GuidedFlow, OperationalSummary } from "../components/OperationalSummary";
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
        subtitle="מקום להתחיל ממנו כשלא בטוחים מה המסך אומר או מה בטוח לעשות"
        actions={<span className="badge badge-info"><HelpCircle size={13} />תיעוד פנימי</span>}
        helpKey="hub.overview"
      />

      <OperationalSummary
        title="איך לא ללכת לאיבוד"
        purpose="העמוד הזה מתרגם מונחים כמו SharePoint, Mongo, Jobs ו־Deploy לשפה תפעולית פשוטה."
        state="כל ההסברים הם לקריאה בלבד ואינם משנים אתרים, הרשאות או Jobs."
        attention="אם פעולה נראית מפחידה, התחילו מהסבר המושג ואז חזרו למסך הפעולה."
        attentionTone="info"
        nextAction="מצאו את המושג או המסך שמבלבל אתכם וקראו קודם את המשמעות והבדיקה המומלצת."
        tone="info"
      />

      <GuidedFlow
        title="מסלול למשתמש חדש"
        steps={[
          { title: "התחילו במסך אתרים", description: "מצאו אתר והבינו האם הוא בריא או דורש טיפול.", status: "active" },
          { title: "בדקו חסמים במסך בעיות וחיבורים", description: "הפרידו בין דפדפן מחובר לבין backend מחובר.", status: "pending" },
          { title: "עברו לפעולה המוגנת", description: "פריסה, שחזור, גיבוי והרשאות עובדים עם אישור או תוכנית.", status: "pending" },
          { title: "פתחו Advanced רק כשצריך", description: "Raw evidence מיועד לתחקור, לא להחלטה הראשונה.", status: "pending" }
        ]}
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
