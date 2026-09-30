import React from 'react';

const COMPANY = 'Opal Properties (Swabhav Properties)';
const CONTACT_EMAIL = 'sales@swabhavproperties.com';
const LAST_UPDATED = '19 September 2026';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="mt-8">
    <h2 className="text-lg font-bold text-slate-900">{title}</h2>
    <div className="mt-2 space-y-3 text-sm leading-relaxed text-slate-600">{children}</div>
  </section>
);

// Public page (no login) -- linked from the Meta / WhatsApp Business app
// settings as the Privacy Policy URL.
export const PrivacyPolicy: React.FC = () => {
  // Deliberately unlinked from the CRM UI and kept out of search engines --
  // it exists only so Meta can fetch it from the app settings.
  React.useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => { document.head.removeChild(meta); };
  }, []);

  return (
  <div className="min-h-screen bg-slate-50">
    <header className="bg-indigo-600 text-white">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-2xl font-extrabold tracking-tight">Privacy Policy</h1>
        <p className="mt-1 text-sm text-indigo-100">{COMPANY} &middot; Last updated {LAST_UPDATED}</p>
      </div>
    </header>

    <main className="mx-auto max-w-3xl px-6 pb-16">
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm leading-relaxed text-slate-600">
          {COMPANY} (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) is a real estate sales and channel-partner
          business. This policy explains what personal information we collect through our website, our internal
          CRM, and our WhatsApp Business communications, how we use it, and the choices you have.
        </p>

        <Section title="1. Information we collect">
          <p>Depending on how you interact with us, we may collect:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Contact details: name, mobile / WhatsApp number, email address and residential address.</li>
            <li>Property enquiry details: project of interest, requirement, budget, preferred visit date, and remarks from our conversations.</li>
            <li>Site-visit and booking records, including booking and payment details relating to a property purchase.</li>
            <li>For channel partners and staff: business name, PAN, GST and RERA numbers, and bank details supplied for commission or payroll payments.</li>
            <li>Messages you exchange with us on WhatsApp, and delivery status of the messages we send you.</li>
          </ul>
        </Section>

        <Section title="2. How we use your information">
          <ul className="list-disc space-y-1 pl-5">
            <li>To respond to your enquiry and to arrange and confirm site visits.</li>
            <li>To process bookings, payments, invoices and commissions.</li>
            <li>To send service messages such as visit confirmations, verification codes, account credentials and follow-ups.</li>
            <li>To send information about our projects, where you have shown interest or agreed to receive it.</li>
            <li>To maintain records, prevent fraud and meet legal, tax and regulatory obligations.</li>
          </ul>
        </Section>

        <Section title="3. WhatsApp communications">
          <p>
            We use the WhatsApp Business Platform provided by Meta Platforms, Inc. to send and receive messages.
            When we message you, your phone number and the message content are processed by WhatsApp / Meta in
            accordance with their own privacy policies. We only message you for the purposes described above.
          </p>
          <p>
            You can stop receiving messages at any time by replying <strong>STOP</strong> to any message or by
            contacting us at the email below. We will honour your request promptly.
          </p>
        </Section>

        <Section title="4. Sharing of information">
          <p>We do <strong>not</strong> sell your personal information. We share it only with:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Service providers that help us run our systems, such as cloud hosting and database providers and Meta (WhatsApp), strictly to deliver our services.</li>
            <li>The developer or builder of the project you are interested in, where needed to arrange a visit or complete a booking.</li>
            <li>Authorities or professional advisers, where required by law.</li>
          </ul>
        </Section>

        <Section title="5. Data retention">
          <p>
            We keep personal information only as long as needed for the purposes above, including to meet legal,
            accounting and tax requirements. When it is no longer required, we delete or anonymise it.
          </p>
        </Section>

        <Section title="6. Security">
          <p>
            Access to our systems is restricted to authorised staff and partners through individual logins and
            role-based permissions, and data is stored with reputable cloud providers using encryption in transit.
            No method of transmission or storage is completely secure, but we take reasonable steps to protect your
            information.
          </p>
        </Section>

        <Section title="7. Your rights">
          <p>
            Subject to applicable law (including the Digital Personal Data Protection Act, 2023), you may ask us to
            access, correct or delete the personal information we hold about you, or to withdraw your consent to
            being contacted.
          </p>
        </Section>

        <Section title="8. Data deletion requests">
          <p>
            To request deletion of your data, email us at{' '}
            <a className="font-semibold text-indigo-600 underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>{' '}
            from the email address or with the mobile number you used to contact us, with the subject
            &ldquo;Data deletion request&rdquo;. We will confirm and complete the request within a reasonable time,
            except for records we are legally required to keep.
          </p>
        </Section>

        <Section title="9. Changes to this policy">
          <p>
            We may update this policy from time to time. The &ldquo;Last updated&rdquo; date above shows when it was
            last changed.
          </p>
        </Section>

        <Section title="10. Contact us">
          <p>
            {COMPANY}
            <br />
            Email:{' '}
            <a className="font-semibold text-indigo-600 underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </p>
        </Section>
      </div>
    </main>
  </div>
  );
};
