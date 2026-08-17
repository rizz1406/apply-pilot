const safeHttpUrl = (value = "") => {
  try { const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`); return ["http:", "https:"].includes(url.protocol) ? url.href : ""; }
  catch { return ""; }
};

export async function buildResumeDocxBlob(resume) {
  const { AlignmentType, BorderStyle, Document, ExternalHyperlink, LevelFormat, Packer, Paragraph, TabStopType, TextRun } = await import("docx");
  const FONT = "Arial";
  const run = (text, options = {}) => new TextRun({ text: String(text || ""), font: FONT, size: 20, ...options });
  const link = (url, label) => new ExternalHyperlink({ link: safeHttpUrl(url), children: [run(label, { color: "000000", underline: {} })] });
  const paragraph = (children, options = {}) => new Paragraph({ children: Array.isArray(children) ? children : [run(children)], spacing: { after: 40, line: 240 }, ...options });
  const heading = (text) => new Paragraph({ children: [run(text.toUpperCase(), { bold: true, size: 21 })], spacing: { before: 100, after: 45 }, border: { bottom: { color: "444444", style: BorderStyle.SINGLE, size: 4, space: 2 } }, keepNext: true });
  const bullet = (text) => new Paragraph({ children: [run(text)], numbering: { reference: "resume-bullets", level: 0 }, spacing: { after: 25, line: 230 }, keepLines: true });
  const children = [];

  children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [run(resume.name || "Your Name", { bold: true, size: 32 })], spacing: { after: 20 } }));
  if (resume.title) children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [run(resume.title, { size: 21 })], spacing: { after: 20 } }));
  const contact = [];
  const addSep = () => { if (contact.length) contact.push(run("  |  ", { size: 18 })); };
  if (resume.email) { addSep(); contact.push(new ExternalHyperlink({ link: `mailto:${resume.email}`, children: [run(resume.email, { size: 18, color: "000000", underline: {} })] })); }
  for (const value of [resume.phone, resume.location]) if (value) { addSep(); contact.push(run(value, { size: 18 })); }
  for (const value of [resume.linkedin, resume.github, resume.website]) if (safeHttpUrl(value)) { addSep(); contact.push(link(value, safeHttpUrl(value).replace(/^https?:\/\//i, "").replace(/\/$/, ""))); }
  if (contact.length) children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: contact, spacing: { after: 70 } }));

  if (resume.summary) { children.push(heading("Summary"), paragraph(resume.summary)); }
  if (resume.skills) { children.push(heading("Skills"), paragraph(resume.skills)); }
  if (resume.experienceStructured?.length) {
    children.push(heading("Experience"));
    for (const item of resume.experienceStructured) {
      children.push(new Paragraph({ children: [run(item.role, { bold: true }), run(item.dates ? `\t${item.dates}` : "")], tabStops: [{ type: TabStopType.RIGHT, position: 10440 }], spacing: { before: 45, after: 15 }, keepNext: true }));
      children.push(new Paragraph({ children: [run([item.company, item.location].filter(Boolean).join(", "), { italics: true })], spacing: { after: 20 }, keepNext: true }));
      (item.bullets || []).forEach((text) => children.push(bullet(text)));
    }
  }
  if (resume.projectsStructured?.length) {
    children.push(heading("Projects"));
    for (const item of resume.projectsStructured) {
      const nameChildren = item.link && safeHttpUrl(item.link) ? [link(item.link, item.name)] : [run(item.name, { bold: true })];
      if (item.tech) nameChildren.push(run(` (${item.tech})`, { color: "444444" }));
      children.push(new Paragraph({ children: nameChildren, spacing: { before: 35, after: 15 }, keepNext: true }));
      (item.bullets || []).forEach((text) => children.push(bullet(text)));
    }
  }
  if (resume.educationStructured?.length) {
    children.push(heading("Education"));
    for (const item of resume.educationStructured) children.push(new Paragraph({ children: [run([item.degree, item.school, item.location].filter(Boolean).join(", "), { bold: true }), run(item.dates ? `\t${item.dates}` : "")], tabStops: [{ type: TabStopType.RIGHT, position: 10440 }], spacing: { after: 30 } }));
  }
  if (resume.certificationsStructured?.length) {
    children.push(heading("Certifications"));
    for (const item of resume.certificationsStructured) children.push(paragraph(item.link && safeHttpUrl(item.link) ? [link(item.link, item.name)] : [run(item.name)]));
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 20 }, paragraph: { spacing: { after: 40, line: 240 } } } } },
    numbering: { config: [{ reference: "resume-bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 180 } } } }] }] },
    sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 720, right: 720, bottom: 720, left: 720, header: 360, footer: 360 } } }, children }],
  });
  return Packer.toBlob(doc);
}
