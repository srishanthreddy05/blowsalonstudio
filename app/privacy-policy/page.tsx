import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Mail, Globe, Shield } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy — BLOW SALON Management Suite",
  description:
    "Privacy Policy for BLOW SALON Management Suite, operated by Thrivex Labs. Explains how customer, salon, and WhatsApp Business information is collected, used, and protected.",
  robots: { index: true, follow: true },
};

const LAST_UPDATED = "October 2, 2026";

interface SectionProps {
  id: string;
  number: string;
  title: string;
  children: React.ReactNode;
}

function Section({ id, number, title, children }: SectionProps) {
  return (
    <section id={id} className="space-y-4 scroll-mt-8">
      <div className="flex items-start gap-3">
        <span className="shrink-0 mt-0.5 inline-flex items-center justify-center size-7 rounded-xl bg-[#E8ECE5] text-[#5F7A62] text-[11px] font-bold border border-[#CCD2C8] font-mono">
          {number}
        </span>
        <h2 className="text-base sm:text-lg font-serif font-bold text-[#1E231E] leading-tight">
          {title}
        </h2>
      </div>
      <div className="pl-10 space-y-3 text-[#3D433D] text-sm leading-relaxed">
        {children}
      </div>
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="font-semibold text-[#2F352F] text-sm">{title}</h3>
      {children}
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5 list-none">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2">
          <span className="mt-2 shrink-0 size-1.5 rounded-full bg-[#5F7A62] opacity-70" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-[#F7F7F4] text-[#292D29]">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-[#F7F7F4]/95 backdrop-blur-sm border-b border-[#E0E4DD]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="grid size-8 place-items-center rounded-xl bg-[#6F776D] text-white shadow-xs shrink-0">
              <span className="font-serif text-sm font-extrabold tracking-tight">B</span>
            </div>
            <span className="font-serif text-sm font-bold tracking-[0.15em] text-[#2F352F] uppercase hidden xs:block">
              BLOW SALON
            </span>
          </div>
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5F7A62] hover:text-[#2F352F] transition-colors"
          >
            <ArrowLeft size={14} />
            Back to BLOW SALON
          </Link>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-14">

        {/* Page title block */}
        <div className="mb-10 sm:mb-12 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#E8ECE5] border border-[#CCD2C8] text-[11px] font-bold text-[#5F7A62] uppercase tracking-wider">
            <Shield size={12} />
            Legal Document
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#1E231E] leading-tight">
            Privacy Policy
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#747A72]">
            <span>
              <strong className="text-[#5F7A62]">Last Updated:</strong>{" "}
              {LAST_UPDATED}
            </span>
            <span className="hidden sm:block text-[#CCD2C8]">·</span>
            <span>BLOW SALON — Management Suite</span>
            <span className="hidden sm:block text-[#CCD2C8]">·</span>
            <span>Operated by Thrivex Labs</span>
          </div>
          <div className="h-px bg-[#E0E4DD] w-full" />
          <p className="text-sm text-[#3D433D] leading-relaxed max-w-2xl">
            This Privacy Policy describes how BLOW SALON collects, uses, stores, and protects information
            when you use our salon management platform and its related services, including integrations
            with the Meta WhatsApp Business Platform and WhatsApp Cloud API.
          </p>
        </div>

        {/* Table of contents (compact) */}
        <nav
          aria-label="Table of contents"
          className="mb-10 p-5 rounded-2xl bg-[#FFFFFF] border border-[#E0E4DD] shadow-xs"
        >
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#747A72] mb-3">
            Contents
          </p>
          <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 list-none text-xs text-[#5F7A62] font-medium">
            {[
              ["#introduction", "1. Introduction"],
              ["#information-we-collect", "2. Information We Collect"],
              ["#how-we-use", "3. How We Use Information"],
              ["#whatsapp-meta", "4. WhatsApp & Meta Integration"],
              ["#coexistence", "5. WhatsApp Business App & Cloud API"],
              ["#how-we-share", "6. How We Share Information"],
              ["#security", "7. Data Storage & Security"],
              ["#retention", "8. Data Retention"],
              ["#deletion", "9. Data Deletion"],
              ["#disconnect", "10. Disconnecting WhatsApp"],
              ["#messages", "11. Customer Messages"],
              ["#marketing", "12. Marketing Communications"],
              ["#cookies", "13. Cookies & Similar Technologies"],
              ["#third-party", "14. Third-Party Services"],
              ["#children", "15. Children's Privacy"],
              ["#international", "16. International Data Processing"],
              ["#changes", "17. Changes to This Policy"],
              ["#contact", "18. Contact Us"],
            ].map(([href, label]) => (
              <li key={href}>
                <a
                  href={href}
                  className="hover:text-[#2F352F] hover:underline transition-colors"
                >
                  {label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* Sections */}
        <div className="space-y-10 sm:space-y-12">

          <Section id="introduction" number="1" title="Introduction">
            <p>
              Welcome to BLOW SALON — Management Suite (&ldquo;BLOW SALON&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;).
            </p>
            <p>
              BLOW SALON is a salon management platform designed to help salons manage customers, billing,
              appointments, staff, invoices, payments, campaigns, and customer communications.
            </p>
            <p>
              This Privacy Policy explains how we collect, use, store, and protect information when you use
              BLOW SALON and its related services, including integrations with Meta WhatsApp Business Platform
              and WhatsApp Cloud API.
            </p>
            <p>
              By using BLOW SALON, you acknowledge the practices described in this Privacy Policy.
            </p>
          </Section>

          <Section id="information-we-collect" number="2" title="Information We Collect">
            <p>
              Depending on how BLOW SALON is used, we may collect and process the following information.
            </p>

            <SubSection title="Customer Information">
              <p>Salons may enter customer information into BLOW SALON, including:</p>
              <BulletList items={[
                "Customer name",
                "Mobile/WhatsApp number",
                "Appointment information",
                "Services purchased",
                "Products purchased",
                "Invoice information",
                "Payment information",
                "Membership information",
                "Customer notes",
                "Communication history",
              ]} />
            </SubSection>

            <SubSection title="Salon and Staff Information">
              <p>The platform may process:</p>
              <BulletList items={[
                "Salon/business name",
                "Staff names and roles",
                "Attendance information",
                "Salary-related information entered by the salon",
                "Service and sales records",
              ]} />
            </SubSection>

            <SubSection title="WhatsApp Information">
              <p>
                When a salon connects its WhatsApp Business account to BLOW SALON, we may process
                information made available through the Meta WhatsApp Business Platform, including:
              </p>
              <BulletList items={[
                "WhatsApp Business Account information",
                "Business phone number information",
                "Customer phone numbers",
                "WhatsApp messages",
                "Message status information such as sent, delivered, read, or failed",
                "Message IDs",
                "Approved WhatsApp message templates",
                "Webhook events",
                "Information required to send and receive WhatsApp messages",
              ]} />
              <p>
                Where supported by Meta, WhatsApp Business App information and message history may also be
                synchronized as part of the WhatsApp Business App and Cloud API integration.
              </p>
            </SubSection>
          </Section>

          <Section id="how-we-use" number="3" title="How We Use Information">
            <p>We use information processed through BLOW SALON to provide and operate the platform, including to:</p>
            <BulletList items={[
              "Manage salon customers",
              "Create and manage invoices",
              "Process billing records",
              "Manage appointments",
              "Manage staff and attendance",
              "Maintain customer records",
              "Send invoice notifications",
              "Send appointment-related communications",
              "Send approved WhatsApp campaigns",
              "Receive and manage customer WhatsApp communications",
              "Maintain message delivery and status records",
              "Provide customer support",
              "Maintain and improve the platform",
              "Detect and prevent unauthorized or abusive use",
              "Maintain the security and reliability of our services",
            ]} />
            <p>
              We do not use customer information for purposes unrelated to providing or supporting the
              salon's use of BLOW SALON unless otherwise disclosed or required by law.
            </p>
          </Section>

          <Section id="whatsapp-meta" number="4" title="WhatsApp and Meta Integration">
            <p>
              BLOW SALON may integrate with Meta&apos;s WhatsApp Business Platform to provide WhatsApp
              messaging functionality.
            </p>
            <p>
              When a salon connects its WhatsApp Business account to BLOW SALON, the salon authorizes
              BLOW SALON to access and use the relevant WhatsApp Business assets and information necessary
              to provide the requested functionality. This may include:
            </p>
            <BulletList items={[
              "WhatsApp Business Account information",
              "Business phone number information",
              "Message templates",
              "Customer messaging information",
              "Incoming and outgoing message information",
              "Message delivery statuses",
              "Webhook events",
            ]} />
            <p>
              BLOW SALON uses the permissions granted through Meta&apos;s authorization and only accesses
              WhatsApp Business information necessary to provide the requested functionality. WhatsApp messages
              sent through BLOW SALON are transmitted using Meta&apos;s WhatsApp Business Platform.
            </p>
          </Section>

          <Section id="coexistence" number="5" title="WhatsApp Business App and Cloud API">
            <p>
              Where supported, BLOW SALON may allow a salon to connect an existing WhatsApp Business App
              account with the WhatsApp Cloud API.
            </p>
            <p>
              In such cases, information made available by Meta through the integration may be synchronized
              with BLOW SALON to provide customer conversation and messaging functionality.
            </p>
            <p>
              The availability and scope of synchronized information are determined by Meta&apos;s WhatsApp
              Business Platform capabilities and the permissions granted by the business.
            </p>
          </Section>

          <Section id="how-we-share" number="6" title="How We Share Information">
            <p>
              We may share or transmit information with service providers and platforms that are necessary
              to operate BLOW SALON.
            </p>

            <SubSection title="Meta Platforms">
              <p>
                We use Meta&apos;s WhatsApp Business Platform and related Meta services to provide WhatsApp
                messaging functionality.
              </p>
            </SubSection>

            <SubSection title="Cloud and Database Providers">
              <p>
                BLOW SALON may use cloud infrastructure and database services to store and process
                application data.
              </p>
            </SubSection>

            <SubSection title="Communication Providers">
              <p>
                Where applicable, we may use third-party communication or email services to deliver
                notifications and transactional communications.
              </p>
            </SubSection>

            <p>We do not sell customer personal information to third parties.</p>
            <p>
              We may disclose information where required by law, legal process, or to protect the security
              and rights of our users, customers, or services.
            </p>
          </Section>

          <Section id="security" number="7" title="Data Storage and Security">
            <p>
              BLOW SALON uses reasonable technical and organizational measures designed to protect
              information against unauthorized access, alteration, disclosure, or destruction.
            </p>
            <p>
              Access to salon data is controlled through authentication and authorization mechanisms.
              Where applicable, sensitive credentials and access tokens used to connect external services
              are stored securely and are not exposed to salon users.
            </p>
            <p>
              However, no internet-based service can guarantee absolute security.
            </p>
          </Section>

          <Section id="retention" number="8" title="Data Retention">
            <p>
              Information may be retained for as long as necessary to provide BLOW SALON services,
              maintain business records, comply with legal obligations, resolve disputes, and enforce
              agreements.
            </p>
            <p>
              The salon using BLOW SALON is responsible for determining appropriate retention and
              deletion of its customer records where applicable.
            </p>
            <p>
              When information is no longer required, it may be deleted or anonymized in accordance
              with applicable requirements and our operational practices.
            </p>
          </Section>

          <Section id="deletion" number="9" title="Data Deletion">
            <p>
              A salon or authorized user may request deletion of information associated with their
              BLOW SALON account. Depending on the type of information and applicable requirements,
              deletion may include:
            </p>
            <BulletList items={[
              "Customer records",
              "Appointment records",
              "Invoice records",
              "Communication records",
              "WhatsApp-related records",
              "Account information",
            ]} />
            <p>
              Some information may need to be retained where required for legal, security, accounting,
              fraud-prevention, or other legitimate purposes.
            </p>
            <p>
              For information controlled by Meta or another third-party platform, deletion may also be
              subject to that platform&apos;s policies and procedures.
            </p>
            <p>
              To request deletion of information, contact us using the contact information provided below.
            </p>
          </Section>

          <Section id="disconnect" number="10" title="Disconnecting WhatsApp">
            <p>
              A salon may disconnect its WhatsApp Business account from BLOW SALON. After disconnection,
              BLOW SALON will no longer use the disconnected WhatsApp Business account for new WhatsApp
              messaging through the integration, subject to any messages or processes already initiated
              before disconnection.
            </p>
            <p>
              Disconnecting BLOW SALON does not necessarily delete information held directly by Meta or
              WhatsApp. Such information remains subject to Meta&apos;s applicable policies.
            </p>
          </Section>

          <Section id="messages" number="11" title="Customer Messages">
            <p>
              When a salon uses BLOW SALON to communicate with customers through WhatsApp, messages may
              be processed and stored by BLOW SALON to provide conversation history, messaging
              functionality, delivery tracking, and related features.
            </p>
            <p>
              The salon is responsible for ensuring that it has an appropriate legal basis and any
              required consent or authorization to communicate with its customers.
            </p>
          </Section>

          <Section id="marketing" number="12" title="Marketing Communications">
            <p>
              BLOW SALON may provide functionality that allows salons to send marketing communications
              through WhatsApp. Salons are responsible for:
            </p>
            <BulletList items={[
              "Obtaining appropriate customer opt-in where required",
              "Using approved WhatsApp templates where required by Meta",
              "Following Meta's WhatsApp Business Platform policies",
              "Honoring customer opt-outs",
              "Sending communications only to appropriate recipients",
            ]} />
            <p>
              BLOW SALON does not guarantee delivery of marketing messages because WhatsApp and Meta may
              apply recipient-level delivery restrictions, quality controls, or other messaging limitations.
            </p>
          </Section>

          <Section id="cookies" number="13" title="Cookies and Similar Technologies">
            <p>
              BLOW SALON may use cookies, local storage, session technologies, or similar mechanisms
              necessary for authentication, security, preferences, and application functionality.
            </p>
            <p>
              We may also use analytics or similar technologies where implemented to understand and improve
              the performance of the service.
            </p>
          </Section>

          <Section id="third-party" number="14" title="Third-Party Services">
            <p>
              BLOW SALON may integrate with third-party services, including Meta and cloud infrastructure
              providers. Those services may process information according to their own privacy policies
              and terms. Users should review the applicable policies of third-party services when
              appropriate.
            </p>
          </Section>

          <Section id="children" number="15" title="Children's Privacy">
            <p>
              BLOW SALON is intended for businesses and business users and is not designed specifically
              for children. We do not knowingly collect personal information directly from children for
              the purpose of providing the service.
            </p>
          </Section>

          <Section id="international" number="16" title="International Data Processing">
            <p>
              Depending on the infrastructure and third-party services used to operate BLOW SALON,
              information may be processed or stored in countries other than the country where the salon
              or customer is located.
            </p>
            <p>
              Where applicable, we take reasonable steps to ensure that such processing is conducted in
              accordance with applicable data protection requirements.
            </p>
          </Section>

          <Section id="changes" number="17" title="Changes to This Privacy Policy">
            <p>
              We may update this Privacy Policy from time to time to reflect changes to BLOW SALON, our
              services, integrations, or applicable legal requirements.
            </p>
            <p>
              When we make changes, we will update the Last Updated date at the beginning of this Privacy
              Policy.
            </p>
          </Section>

          <Section id="contact" number="18" title="Contact Us">
            <p>
              If you have questions about this Privacy Policy, data processed through BLOW SALON, or a
              data deletion request, please contact us:
            </p>

            <div className="rounded-2xl bg-[#FFFFFF] border border-[#E0E4DD] shadow-xs p-5 space-y-4">
              <div className="space-y-0.5">
                <p className="font-bold text-[#2F352F] text-sm">BLOW SALON — Management Suite</p>
                <p className="text-xs text-[#747A72]">Operated by Thrivex Labs</p>
              </div>

              <div className="space-y-3">
                <a
                  href="mailto:srishanthreddyy05@gmail.com"
                  className="flex items-center gap-2.5 text-sm text-[#5F7A62] hover:text-[#2F352F] font-medium transition-colors group"
                >
                  <span className="grid size-8 place-items-center rounded-xl bg-[#E8ECE5] border border-[#CCD2C8] text-[#5F7A62] group-hover:bg-[#5F7A62] group-hover:text-white transition-colors shrink-0">
                    <Mail size={14} />
                  </span>
                  srishanthreddyy05@gmail.com
                </a>

                <a
                  href="https://blowsalonstudio.vercel.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2.5 text-sm text-[#5F7A62] hover:text-[#2F352F] font-medium transition-colors group"
                >
                  <span className="grid size-8 place-items-center rounded-xl bg-[#E8ECE5] border border-[#CCD2C8] text-[#5F7A62] group-hover:bg-[#5F7A62] group-hover:text-white transition-colors shrink-0">
                    <Globe size={14} />
                  </span>
                  blowsalonstudio.vercel.app
                </a>
              </div>
            </div>
          </Section>
        </div>

        {/* Back link */}
        <div className="mt-14 pt-8 border-t border-[#E0E4DD] flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#5F7A62] hover:text-[#2F352F] transition-colors"
          >
            <ArrowLeft size={15} />
            Back to BLOW SALON
          </Link>
          <p className="text-xs text-[#A0A69D]">
            Last Updated: {LAST_UPDATED}
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E0E4DD] bg-[#FFFFFF]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#747A72]">
          <div className="flex items-center gap-2">
            <div className="grid size-6 place-items-center rounded-lg bg-[#6F776D] text-white">
              <span className="font-serif text-[10px] font-extrabold">B</span>
            </div>
            <span>© {new Date().getFullYear()} BLOW SALON. Operated by Thrivex Labs. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[#A0A69D]">Privacy Policy</span>
            <a
              href="mailto:srishanthreddyy05@gmail.com"
              className="text-[#5F7A62] hover:underline"
            >
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
