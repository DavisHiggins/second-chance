"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CONTACT } from "@/lib/content";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";

/**
 * Two boxes and a Send button. Nothing is posted anywhere: Send builds a
 * `mailto:` link with the subject and message exactly as typed and hands it
 * to the reader's mail app. The draft lives only in component state.
 */
export function ContactForm() {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!sent) return;
    const timer = window.setTimeout(() => setSent(false), 2400);
    return () => window.clearTimeout(timer);
  }, [sent]);

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!subject.trim() || !message.trim()) {
      setError(CONTACT.validation);
      return;
    }
    setError(null);
    const href = `mailto:${CONTACT.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
    window.location.href = href;
    setSent(true);
  };

  return (
    <Card as="div" style={{ padding: "var(--space-5)" }}>
      <form onSubmit={onSubmit} noValidate className="space-y-4" aria-describedby="contact-form-note">
        <label className="block">
          <span className="field-label">{CONTACT.subjectLabel}</span>
          <input
            type="text"
            name="subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder={CONTACT.subjectPlaceholder}
            autoComplete="off"
            className="field w-full"
          />
        </label>
        <label className="block">
          <span className="field-label">{CONTACT.messageLabel}</span>
          <textarea
            name="message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={CONTACT.messagePlaceholder}
            rows={8}
            className="field w-full resize-y py-3"
            style={{ minHeight: 180, lineHeight: 1.55 }}
          />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p id="contact-form-note" className="t-caption max-w-[48ch]" style={{ color: "var(--ink-muted)" }}>
            {CONTACT.formNote}
          </p>
          <Button type="submit" variant="primary" arrow success={sent}>
            {sent ? CONTACT.sent : CONTACT.send}
          </Button>
        </div>
        <p role="alert" className="t-small" style={{ color: "var(--ink-secondary)", minHeight: 20 }}>
          {error ?? ""}
        </p>
      </form>
    </Card>
  );
}

export default ContactForm;
