/* The five store policy pages, transcribed from TWCinc's negosyoonline_sante_pack/templates/.../policies/*.html (terms,
   privacy, shipping, returns, payment) and policy.html: text, order, class names and markup are the templates'. Different
   from them, on purpose:
   - the values are the backend's policy answer (GET /storefront/v1/policies/{slug}/: business, shipping, privacy), under
     TWCinc's own names, so each template body reads them as `v.business.name` and so on;
   - the Santé-membership lines of the privacy page always show: only Santé sites are served here (TWCinc's sante_membership);
   - a page is live only when the backend answers it; otherwise it is the neutral 404 (TWCinc: policy_view). */
import { html, type Markup } from "../../lib/html.ts";
import type { Policy } from "../../lib/pack-api.ts";
import { packDocument, type PackCtx } from "./pack-page.ts";

type V = Policy;

const terms = (v: V): Markup => html`
<h2>1. Introduction</h2>
<p>Welcome to ${v.business.name} ("Store," "we," "our," or "us"), an online retail business operating in the Philippines.</p>
<p>These Terms &amp; Conditions govern your access to and use of ${v.business.website_url}, including purchases, customer accounts, orders, promotions, and related services.</p>
<p>By using our website or placing an order, you agree to these Terms &amp; Conditions. Nothing in these Terms limits your rights under applicable Philippine law.</p>
<h2>2. Business Information</h2>
<p>Registered Business Name: ${v.business.name}</p>
<p>Business Address: ${v.business.address}</p>
<p>Email: ${v.business.email}</p>
<p>Contact Number: ${v.business.phone}</p>
<p>Website: ${v.business.website_url}</p>
${v.business.registration_details ? html`<p>Registration Details: ${v.business.registration_details}</p>` : ""}
<h2>3. Products and Seller Relationship</h2>
<p>We sell genuine Santé products sourced through authorized distribution channels.</p>
<p>${v.business.name} operates as an independent Santé distributor and retailer. We are not Santé International's corporate website and do not act as its legal representative unless expressly authorized.</p>
<p>Product information, contents, quantities, prices, and available promotions are displayed on the relevant product pages.</p>
<p>Food supplements are not substitutes for medical treatment. Customers should follow the approved product labeling and consult a qualified healthcare professional when appropriate.</p>
<p>We do not represent that supplements can diagnose, treat, cure, or prevent diseases unless such claims are expressly authorized by applicable regulatory approvals.</p>
<h2>4. Pricing and Promotions</h2>
<p>All prices are displayed in Philippine Pesos (PHP).</p>
<p>The total amount payable, including applicable shipping charges and other disclosed fees, will be presented before order confirmation.</p>
<p>Discounts, promotional offers, free-shipping eligibility, and bundled-product conditions are subject to the terms disclosed with each promotion.</p>
<p>We may correct genuine listing errors. If an error affects an existing order, we will notify the customer and offer appropriate options, including a refund where required.</p>
<h2>5. Orders and Confirmation</h2>
<p>Customers must provide accurate and complete contact, payment, and delivery information.</p>
<p>After placing an order, the customer will receive an acknowledgment containing the order reference and relevant transaction details.</p>
<p>An order may require payment verification, stock confirmation, or other reasonable validation before fulfillment.</p>
<p>If we cannot fulfill an order, we will notify the customer and provide an appropriate refund for amounts paid.</p>
<p>We will issue the required sales invoice or other legally appropriate transaction document.</p>
<h2>6. Payment</h2>
<p>We accept the payment methods displayed at checkout.</p>
<p>All payment transactions are governed by our Payment Policy.</p>
<p>We will not require customers to disclose online banking passwords, payment PINs, or one-time passwords to our customer support representatives.</p>
<h2>7. Shipping and Delivery</h2>
<p>Shipping availability, fees, estimated processing times, and delivery conditions are explained in our Shipping &amp; Delivery Policy.</p>
<p>Customers are responsible for providing accurate delivery information and reasonably cooperating with delivery attempts.</p>
<p>Delays, missing shipments, and damaged deliveries will be handled in accordance with our Shipping &amp; Delivery Policy and applicable law.</p>
<h2>8. Cancellation of Orders</h2>
<p>Customers may request cancellation by contacting our customer support team with their order reference.</p>
<p>Cancellation requests received before order dispatch will be evaluated promptly, taking into account the order's processing status and applicable consumer rights.</p>
<p>For orders already dispatched, applicable cancellation conditions and statutory rights will be observed, including Section 19 of Republic Act No. 11967.</p>
<p>If an accepted cancellation involves an advance payment, we will initiate the appropriate refund.</p>
<p>Cancellation rules will not prevent a customer from exercising rights relating to defective, incorrect, or nonconforming goods.</p>
<h2>9. Returns and Refunds</h2>
<p>Customers are entitled to remedies provided by applicable Philippine consumer protection laws, including appropriate repair, replacement, refund, or other remedies for defective, incorrect, or nonconforming goods.</p>
<p>Our detailed procedures are described in the Return &amp; Refund Policy.</p>
<p>No provision of these Terms shall be interpreted as an absolute prohibition against returns or refunds.</p>
<h2>10. Santé Membership and Distributor Enrollment</h2>
<p>Selected purchases may include an opportunity to apply for or obtain Santé Preferred Membership or distributor benefits, subject to the official Santé International program terms.</p>
<p>Eligibility, enrollment, approval, distributor privileges, commissions, and continuing membership obligations are governed by the applicable official Santé membership documents.</p>
<p>Purchasing products from this website does not automatically guarantee approval of a Santé distributor account unless expressly confirmed through the appropriate Santé enrollment process.</p>
<p>Customers must review the official Santé Membership Terms when purchasing a membership-related package.</p>
<p>Our customer account system is separate from the official Santé membership system unless expressly stated otherwise.</p>
<h2>11. Customer Accounts</h2>
<p>Where account registration is available, customers are responsible for maintaining the confidentiality of their login credentials.</p>
<p>Customers must provide truthful information and must not use accounts for fraud, unauthorized activity, or unlawful purposes.</p>
<p>We may restrict access where reasonably necessary for security, fraud prevention, or compliance with law, subject to applicable customer rights.</p>
<h2>12. Privacy and Personal Data</h2>
<p>We collect and process personal information in accordance with our Privacy &amp; Cookies Policy and the Data Privacy Act of 2012.</p>
<p>By using the website, you acknowledge the availability of our Privacy &amp; Cookies Policy. Separate consent will be obtained where required by law.</p>
<h2>13. Complaints and Dispute Resolution</h2>
<p>Customers may submit complaints through:</p>
${v.business.complaints_contact ? html`<p>Complaints Contact: ${v.business.complaints_contact}</p>` : ""}
<p>Email: ${v.business.email}</p>
<p>Phone: ${v.business.phone}</p>
<p>Customers should provide their name, contact information, order number where applicable, a description of the concern, and supporting information reasonably necessary to investigate it.</p>
<p>Our internal complaint procedure includes:</p>
<ol class="pp-policy-list">
<li>Receiving and recording the complaint.</li>
<li>Acknowledging the concern and providing a reference when available.</li>
<li>Reviewing relevant transaction records and evidence.</li>
<li>Coordinating with payment, fulfillment, or delivery providers when necessary.</li>
<li>Communicating the proposed resolution and implementing any agreed or legally required remedy.</li>
</ol>
<p>Under Republic Act No. 11967, the internal redress mechanism is deemed exhausted when a complaint remains unresolved seven (7) calendar days after filing.</p>
<p>Customers may then pursue their applicable rights through the Department of Trade and Industry, another competent regulatory authority, or other lawful dispute resolution channels.</p>
<p>Nothing in these Terms prevents customers from exercising rights that cannot lawfully be waived.</p>
<h2>14. Intellectual Property</h2>
<p>Website content, images, graphics, text, and other materials are protected by applicable intellectual property laws.</p>
<p>Santé International trademarks, product names, and official brand materials remain the property of their respective owners.</p>
<p>Their display does not transfer ownership or imply corporate ownership of this website by Santé International.</p>
<h2>15. Limitation of Liability</h2>
<p>We are responsible for obligations imposed on us under applicable law, including consumer protection and product-related obligations.</p>
<p>We are not responsible for losses caused exclusively by circumstances beyond our reasonable control, except where applicable law provides otherwise.</p>
<p>Nothing in these Terms excludes liability or remedies that cannot lawfully be excluded.</p>
<h2>16. Updates to These Terms</h2>
<p>We may revise these Terms to reflect operational, legal, or regulatory changes.</p>
<p>The current version and effective date will be displayed on this page. Material changes will be communicated where required by law.</p>
<p>Changes will not retrospectively remove rights that accrued under an earlier transaction.</p>
<h2>17. Governing Law</h2>
<p>These Terms are governed by the laws of the Republic of the Philippines, without prejudice to applicable mandatory consumer protections.</p>
<h2>18. Contact Information</h2>
<p>${v.business.name}</p>
<p>${v.business.address}</p>
<p>${v.business.email}</p>
<p>${v.business.phone}</p>
`;

const privacy = (v: V): Markup => html`
<h2>1. Introduction</h2>
<p>${v.business.name} ("Store," "we," "our," or "us") respects your privacy and is committed to protecting personal information in accordance with Republic Act No. 10173, the Data Privacy Act of 2012, its implementing rules, and applicable issuances of the National Privacy Commission.</p>
<p>This Privacy &amp; Cookies Policy explains what information we collect, how we use and protect it, who may receive it, and how you may exercise your privacy rights.</p>
<p>Personal Information Controller: ${v.business.name}</p>
<p>Business Address: ${v.business.address}</p>
<p>Privacy Contact: ${v.business.privacy_email}</p>
<h2>2. Personal Information We Collect</h2>
<p>Depending on the services you use, we may collect:</p>
<ul class="pp-policy-list">
<li>Identity and contact details, including name, mobile number, email address, billing address, and shipping address.</li>
<li>Account information, authentication records, and account preferences.</li>
<li>Order details, transaction references, purchases, and customer service history.</li>
<li>Payment status and payment-provider references. Payment credentials are processed by the relevant payment provider where applicable.</li>
<li>Uploaded payment proof images, bank transfer receipts, payment screenshots, transaction references, and related verification information. These files are kept in private storage and are available only to authorized persons.</li>
<li>Shipping and delivery information.</li>
<li>Communications sent through our website, email, chat, or other customer service channels.</li>
<li>Device, browser, IP address, session, cookie, analytics, and other technical information.</li>
<li>Marketing preferences and consent records.</li>
<li>For purchases that include Santé membership enrollment, your date of birth and desired username.</li>
</ul>
<p>We collect information directly from you, through website interactions, or from authorized service providers involved in processing your transactions.</p>
<p>We do not intentionally request sensitive personal information unless it is necessary for a specific lawful purpose and appropriate protections are in place.</p>
<h2>3. Purposes and Legal Bases for Processing</h2>
<p>We process information for the following purposes, relying on an applicable lawful basis under the Data Privacy Act:</p>
<p><b>Order fulfillment:</b> Processing orders, coordinating deliveries, managing refunds, and responding to contractual requests.</p>
<p><b>Payment verification:</b> Confirming payment status, investigating transaction issues, and coordinating with authorized payment providers.</p>
<p><b>Account administration:</b> Maintaining customer accounts, authentication, and account security.</p>
<p><b>Customer support:</b> Answering inquiries, responding to complaints, and resolving disputes.</p>
<p><b>Fraud prevention and security:</b> Detecting unauthorized activity and protecting customers and our systems where permitted by law.</p>
<p><b>Legal compliance:</b> Meeting applicable tax, accounting, consumer protection, regulatory, and recordkeeping obligations.</p>
<p><b>Marketing and advertising:</b> Sending promotional communications and performing advertising-related processing where supported by an appropriate lawful basis, including consent where required.</p>
<p>We do not use consent as a blanket legal basis for all processing. Certain information is necessary to fulfill purchases or comply with legal obligations.</p>
<h2>4. Sharing and Disclosure</h2>
<p>We may disclose necessary personal information to:</p>
<ul class="pp-policy-list">
<li>Authorized payment service providers, including Xendit when enabled.</li>
<li>Courier, shipping, tracking, and fulfillment providers.</li>
<li>Hosting, infrastructure, security, and technology service providers.</li>
<li>Customer support, messaging, email, and SMS service providers.</li>
<li>Analytics and advertising providers, where applicable and lawfully enabled.</li>
<li>Professional advisers and competent government authorities where legally justified or required.</li>
<li>Santé International, only for purchases that include Santé membership enrollment. For those purchases we transfer your name, date of birth, desired username, mobile number, email address, and delivery address so that your membership can be registered and administered. Ordinary product purchases do not require this sharing.</li>
</ul>
<p>Service providers are given access only as appropriate for their assigned functions, subject to relevant contractual and security safeguards.</p>
<p>We do not sell customer personal information.</p>
<p>Where third-party providers act as independent personal information controllers, their own privacy notices may also apply.</p>
<h2>5. Cookies and Similar Technologies</h2>
<p>Our website may use the following categories:</p>
<p><b>Strictly necessary cookies:</b> Used for authentication, shopping carts, website security, session management, and checkout functions.</p>
<p><b>Functional cookies:</b> Used to remember optional preferences and improve functionality.</p>
<p><b>Analytics cookies:</b> Used to understand website traffic and performance.</p>
<p><b>Advertising and measurement technologies:</b> May include advertising pixels, conversion tracking, and related measurement systems when enabled.</p>
<p>Where required, optional cookies and tracking technologies will be subject to an appropriate consent mechanism before activation.</p>
<p>Visitors may manage optional cookie preferences through the website's cookie controls when available and through supported browser settings.</p>
<p>Disabling certain cookies may affect website functionality.</p>
<h2>6. Marketing Communications</h2>
<p>Customers may receive order confirmations, delivery notifications, payment updates, and other necessary transactional communications.</p>
<p>Promotional emails, messages, or advertising-related communications will be handled separately in accordance with applicable law.</p>
<p>Customers may withdraw promotional consent or opt out using available unsubscribe mechanisms or by contacting ${v.business.privacy_email}.</p>
<p>Opting out of promotional messaging will not automatically stop necessary communications relating to active orders.</p>
<h2>7. Data Retention</h2>
<p>We retain personal information only for as long as reasonably necessary for the purpose for which it was collected, or as required or permitted by applicable law.</p>
<p>The Store applies the following documented retention schedule:</p>
<p><b>Order, sales, invoice, and tax-related records:</b> ${v.privacy.order_retention_period}</p>
<p><b>Customer account records:</b> ${v.privacy.account_retention_period}</p>
<p><b>Customer support and complaint records:</b> ${v.privacy.support_retention_period}</p>
<p><b>Marketing consent and preference records:</b> ${v.privacy.marketing_retention_period}</p>
<p><b>Security logs:</b> ${v.privacy.security_retention_period}</p>
<p><b>Analytics data:</b> ${v.privacy.analytics_retention_period}</p>
<p>Legal holds, pending disputes, and mandatory recordkeeping requirements may justify longer retention where lawful.</p>
<p>After the applicable retention period, personal information will be securely deleted, anonymized, or otherwise disposed of in accordance with our data retention procedures.</p>
<h2>8. Information Security</h2>
<p>We implement reasonable and appropriate organizational, physical, and technical security measures intended to protect personal information against unauthorized access, loss, misuse, alteration, or disclosure.</p>
<p>These may include encrypted communications, access controls, authentication, authorized personnel access, security monitoring, and appropriate safeguards for service providers.</p>
<p>No online system can guarantee absolute security. We maintain incident response procedures and will comply with applicable personal-data breach notification obligations.</p>
<h2>9. International Data Processing</h2>
<p>Some authorized technology providers may process or store information outside the Philippines.</p>
<p>Where this occurs, we will use appropriate legal and organizational safeguards and remain accountable for processing activities as required by applicable Philippine privacy law.</p>
<h2>10. Your Data Privacy Rights</h2>
<p>Subject to applicable requirements and limitations, you may exercise the following rights:</p>
<ul class="pp-policy-list">
<li>Right to be informed.</li>
<li>Right to access your personal information.</li>
<li>Right to object to certain processing.</li>
<li>Right to rectify inaccurate personal information.</li>
<li>Right to erasure or blocking when applicable.</li>
<li>Right to data portability where applicable.</li>
<li>Right to damages where legally justified.</li>
<li>Right to file a complaint with the National Privacy Commission.</li>
</ul>
<p>Where processing depends on consent, you may withdraw that consent, subject to applicable legal limitations.</p>
<p>To exercise these rights, contact ${v.business.privacy_email}. We may request reasonable verification of identity before processing a request.</p>
<h2>11. Children's Privacy</h2>
<p>Our online store is not intended for independent purchases by individuals who lack legal capacity to enter into the relevant transactions.</p>
<p>Where personal information of a minor is processed, we will observe applicable requirements concerning parental or guardian authorization and protection of children's information.</p>
<h2>12. Third-Party Services</h2>
<p>Our website may link to third-party websites or services, including payment providers and official Santé International resources.</p>
<p>We are not responsible for the independent privacy practices of third parties, but will take appropriate steps when selecting and engaging our own service providers.</p>
<h2>13. Changes to This Policy</h2>
<p>We may update this Policy when our data practices, technologies, or legal obligations change.</p>
<p>The current version and effective date will be displayed on this page. Material changes will be communicated where required.</p>
<h2>14. Contact Information</h2>
<p>Personal Information Controller: ${v.business.name}</p>
<p>Address: ${v.business.address}</p>
<p>Privacy Email: ${v.business.privacy_email}</p>
<p>General Email: ${v.business.email}</p>
<p>Phone: ${v.business.phone}</p>
`;

const shipping = (v: V): Markup => html`
<h2>1. Overview</h2>
<p>${v.business.name} provides shipping and delivery services for eligible orders placed through ${v.business.website_url}.</p>
<p>This policy explains our order-processing procedures, shipping charges, estimated delivery times, tracking, and handling of delivery issues.</p>
<h2>2. Delivery Coverage</h2>
<p>We deliver to supported locations within the Philippines, subject to courier availability, product restrictions, and serviceability.</p>
<p>Available delivery options will be displayed during checkout.</p>
<p>Certain areas may not be serviceable by our available courier partners. Customers will be informed if delivery cannot be arranged.</p>
<h2>3. Order Processing</h2>
<p>Orders are processed after successful payment verification.</p>
<p><b>Normal Order Processing Time:</b> ${v.shipping.processing_time}</p>
<p>Orders placed during weekends, holidays, or outside regular processing hours may be processed on the next available business day.</p>
<p>Processing time refers to the preparation and dispatch of an order and does not include courier delivery time.</p>
<p>If an item is unavailable after order placement, we will contact the customer with the available options, including a refund where applicable.</p>
<h2>4. Delivery Timeframes</h2>
<p>Estimated delivery periods depend on the customer's location, courier service, and prevailing operational conditions.</p>
<p><b>Metro Manila:</b> ${v.shipping.metro_manila_estimate}</p>
<p><b>Luzon Outside Metro Manila:</b> ${v.shipping.luzon_estimate}</p>
<p><b>Visayas:</b> ${v.shipping.visayas_estimate}</p>
<p><b>Mindanao:</b> ${v.shipping.mindanao_estimate}</p>
${v.shipping.other_areas_estimate ? html`<p><b>Other Serviceable Areas:</b> ${v.shipping.other_areas_estimate}</p>` : ""}
<p>These are estimates and not guaranteed delivery dates unless a specific guaranteed service is expressly offered.</p>
<p>The estimated delivery date or period applicable to an order will be presented at checkout or in the order confirmation where reasonably available.</p>
<p>We will provide appropriate assistance and updates when material delays occur.</p>
<h2>5. Shipping Charges</h2>
<p>Shipping fees are based on applicable delivery factors, which may include destination, parcel size, weight, and available courier services.</p>
<p>The applicable shipping fee will be disclosed before the customer confirms the order.</p>
<p>Free-shipping promotions, when offered, are subject to the qualifying conditions displayed at the time of purchase.</p>
<p>Customers will not be charged undisclosed delivery fees.</p>
<h2>6. Courier Services</h2>
<p>We may use authorized third-party courier and logistics providers.</p>
<p>Courier availability may change according to location, service availability, and operational requirements.</p>
<p>Where necessary, we may arrange an alternative courier, provided that the change does not impose additional undisclosed costs or materially disadvantage the customer without appropriate notice.</p>
<h2>7. Order Tracking</h2>
<p>Where tracking is supported, customers will be provided with a tracking reference or access to the Store's order-tracking facility.</p>
<p>Tracking information may not become available immediately after the order is prepared.</p>
<p>Customers may contact our support team if tracking information is unavailable or an order appears unusually delayed.</p>
<h2>8. Delivery Attempts</h2>
<p>Customers should provide complete and accurate delivery details, including a reachable mobile number.</p>
<p>When a delivery attempt is unsuccessful, the courier may attempt redelivery in accordance with its applicable procedures.</p>
<p>If delivery fails because of an incorrect address, unavailable recipient, or other circumstances attributable to the customer, we will explain the available redelivery or return arrangements and any lawful additional charges before proceeding.</p>
<h2>9. Delayed, Lost, or Undelivered Orders</h2>
<p>If an order is delayed, missing, or incorrectly marked as delivered, customers may contact us using their order reference.</p>
<p>We will review the delivery status and coordinate with the courier where necessary.</p>
<p>If goods are lost or are not delivered due to circumstances for which the Store is responsible, we will provide the legally appropriate remedy, which may include replacement or refund.</p>
<h2>10. Damaged or Incorrect Products</h2>
<p>Customers who receive visibly damaged, incorrect, incomplete, or nonconforming products should contact customer support as soon as reasonably practicable.</p>
<p>Customers may provide their order number, photographs, and a description of the problem to assist our investigation.</p>
<p>Failure to report a concern immediately does not automatically remove rights available under applicable consumer law.</p>
<p>Eligible cases will be handled under our Return &amp; Refund Policy.</p>
<h2>11. Changes to Delivery Arrangements</h2>
<p>A customer may request an address change before dispatch.</p>
<p>Address changes are subject to operational feasibility. We will communicate any material effect on the delivery arrangement before implementing it.</p>
<p>Once the parcel has been dispatched, changes may depend on courier capabilities.</p>
<h2>12. Contact Information</h2>
<p>For delivery inquiries:</p>
<p>${v.business.name}</p>
<p>${v.business.email}</p>
<p>${v.business.phone}</p>
<p>${v.business.address}</p>
`;

const returns = (v: V): Markup => html`
<h2>1. Overview</h2>
<p>${v.business.name} is committed to fair and transparent handling of returns, exchanges, refunds, and other consumer remedies.</p>
<p>This policy is intended to comply with applicable Philippine consumer protection laws, including Republic Act No. 7394 and Republic Act No. 11967.</p>
<p>Nothing in this policy limits rights or remedies that customers are entitled to under applicable law.</p>
<h2>2. Eligible Reasons for Return, Replacement, or Refund</h2>
<p>A customer may request an appropriate remedy if a purchased product:</p>
<ul class="pp-policy-list">
<li>Is defective or damaged through no fault of the customer.</li>
<li>Is expired upon delivery.</li>
<li>Is counterfeit or materially misrepresented.</li>
<li>Is different from the product ordered.</li>
<li>Has missing items or an incorrect quantity.</li>
<li>Does not conform to its advertised description or applicable contractual conditions.</li>
<li>Is subject to another ground for relief under applicable law.</li>
</ul>
<p>Depending on the circumstances and applicable law, remedies may include repair, replacement, refund, or other legally available relief.</p>
<h2>3. Change-of-Mind Purchases</h2>
<p>For goods correctly delivered in acceptable condition, returns or refunds solely because of a change of mind are not ordinarily offered unless a specific promotion or agreement provides otherwise.</p>
<p>This provision does not affect remedies for defective, expired, incorrect, counterfeit, or otherwise nonconforming products.</p>
<h2>4. Food Supplements and Product Safety</h2>
<p>For customer health and safety, opened or improperly stored food supplements may be unsuitable for resale.</p>
<p>However, a product's opened packaging does not automatically disqualify a customer from remedies for defects, misrepresentation, or other grounds protected by law.</p>
<p>We evaluate each complaint based on the circumstances and applicable consumer rights.</p>
<p>Customers should retain affected products where reasonably possible while an investigation is ongoing.</p>
<h2>5. How to Submit a Request</h2>
<p>Customers may submit a return, replacement, or refund request through:</p>
${v.business.complaints_contact ? html`<p>Complaints Contact: ${v.business.complaints_contact}</p>` : ""}
<p>Email: ${v.business.email}</p>
<p>Phone: ${v.business.phone}</p>
<p>The request should include, where available:</p>
<ol class="pp-policy-list">
<li>Customer name and contact information.</li>
<li>Order or transaction reference.</li>
<li>Product name and quantity.</li>
<li>Description of the issue.</li>
<li>Relevant photographs, videos, or other supporting evidence.</li>
</ol>
<p>We may request reasonable additional information necessary to verify the complaint, without imposing unnecessary barriers to the exercise of consumer rights.</p>
<h2>6. Review and Resolution Procedure</h2>
<p>Upon receiving a request, we will:</p>
<ol class="pp-policy-list">
<li>Record and acknowledge the complaint.</li>
<li>Review the order details and supporting information.</li>
<li>Investigate the concern, including consultation with the courier or supplier when necessary.</li>
<li>Inform the customer of the proposed remedy.</li>
<li>Arrange return, replacement, refund, or another appropriate resolution.</li>
<li>Document the resolution and communicate its completion.</li>
</ol>
<p>We aim to resolve complaints promptly.</p>
<p>Under Republic Act No. 11967, the internal complaint mechanism is deemed exhausted when a complaint remains unresolved seven (7) calendar days after filing. This does not automatically establish a seven-day deadline for every refund to reach the customer's account.</p>
<h2>7. Return Shipping Costs</h2>
<p>When a customer is legally entitled to a replacement or refund because of a defect, nonconformity, or another issue attributable to the Store, return of the original goods will be arranged without cost to the customer, as provided by applicable law.</p>
<p>For voluntary returns not required by law, any applicable return-shipping arrangements will be disclosed to and agreed upon with the customer.</p>
<h2>8. Refund Processing</h2>
<p>Once a refund has been approved or legally determined to be due, we will initiate it without unreasonable delay.</p>
<p>The actual date funds become available may depend on the payment method, payment processor, card issuer, bank, or other financial institution.</p>
<p>We will inform the customer of the refund method and available processing status.</p>
<p>Refunds may be made through the original payment channel or another mutually agreed lawful method.</p>
<p>We will not impose unauthorized refund deductions or withhold legally required refunds because of internal processing delays.</p>
<h2>9. Exchanges and Replacements</h2>
<p>If replacement is the appropriate remedy, we will coordinate the replacement process and advise the customer of the applicable delivery arrangements.</p>
<p>If an appropriate replacement cannot be provided, we will discuss legally available alternatives, including a refund where required.</p>
<h2>10. Canceled or Unfulfilled Orders</h2>
<p>If an advance-paid order is canceled with a valid entitlement to a refund, or cannot be fulfilled by the Store, we will arrange a refund for the applicable amount.</p>
<p>Cancellation requests are also governed by the Website Terms &amp; Conditions and relevant consumer laws.</p>
<h2>11. Santé Membership Packages</h2>
<p>Where an order includes Santé products together with membership or distributor enrollment benefits, the contents and conditions of the package will be disclosed before purchase.</p>
<p>Official Santé membership approval and distributor privileges are governed by the applicable Santé International membership rules.</p>
<p>Any request concerning products sold by ${v.business.name} will be assessed under this policy and applicable law.</p>
<p>Membership program rules shall not be used to remove statutory remedies owed by the Store.</p>
<h2>12. Unresolved Complaints</h2>
<p>Customers may raise unresolved concerns with the Department of Trade and Industry or another appropriate regulatory authority after pursuing the applicable internal complaint process, subject to applicable law.</p>
<h2>13. Contact Information</h2>
<p>${v.business.name}</p>
<p>${v.business.address}</p>
<p>${v.business.email}</p>
<p>${v.business.phone}</p>
`;

const payment = (v: V): Markup => html`
<h2>1. Overview</h2>
<p>This Payment Policy explains the payment methods, payment verification procedures, transaction security measures, and payment-related dispute processes used by ${v.business.name}.</p>
<p>By placing an order, customers agree to the applicable payment terms disclosed before completing their purchase.</p>
<h2>2. Accepted Payment Methods</h2>
<p>Customers may pay using the payment methods made available during checkout.</p>
<p>Depending on availability, these may include:</p>
<ul class="pp-policy-list">
<li>Online payment channels supported by our authorized payment service providers.</li>
<li>Debit or credit card payments, where enabled.</li>
<li>Electronic wallet and bank-based payments, where enabled.</li>
<li>Manual bank transfers, where offered.</li>
</ul>
<p>The availability of a payment method may vary based on order type, transaction amount, location, and payment provider.</p>
<p>Only methods enabled and displayed during checkout are available for the relevant transaction.</p>
<h2>3. Currency and Charges</h2>
<p>Prices and transaction amounts are displayed in Philippine Pesos (PHP).</p>
<p>The customer will be shown the order total, applicable delivery charges, and any additional fees before final confirmation.</p>
<p>We will not impose undisclosed payment charges.</p>
<p>Any payment-channel charges lawfully payable by the customer will be disclosed before the transaction is finalized.</p>
<h2>4. Manual Bank Transfers</h2>
<p>When manual bank transfer is available, customers must use only the verified account information displayed in the official checkout process or provided through an authenticated Store communication.</p>
<p>Customers may be requested to upload proof of payment or provide a transaction reference.</p>
<p>Submitting a screenshot or proof of payment does not automatically establish successful payment.</p>
<p>We may independently verify receipt of funds before releasing an order for fulfillment.</p>
<p>If the submitted payment cannot be verified, we will contact the customer to clarify the transaction.</p>
<p>Customers should not transfer funds to unverified accounts or account details received from unauthorized third parties.</p>
<h2>5. Order and Payment Confirmation</h2>
<p>After order submission, customers will receive an order acknowledgment through an available communication channel.</p>
<p>For prepaid transactions, order fulfillment normally begins after successful payment verification and applicable stock or fraud checks.</p>
<p>Customers will receive confirmation of payment when verification has been completed.</p>
<p>Pending, failed, canceled, or unsuccessful payment attempts will not be treated as completed payments.</p>
<h2>6. Failed Payments</h2>
<p>If a payment fails, customers may use an available alternative payment method or retry the payment according to the applicable checkout instructions.</p>
<p>Customers should verify the transaction status before attempting another payment to avoid accidental duplicate charges.</p>
<p>If money appears to have been debited despite a failed checkout, customers should contact us with the relevant transaction details.</p>
<h2>7. Duplicate or Incorrect Charges</h2>
<p>Customers who believe they were charged more than once or charged an incorrect amount may contact:</p>
<p>Email: ${v.business.email}</p>
<p>Phone: ${v.business.phone}</p>
<p>We will review transaction records, coordinate with the relevant payment provider, and arrange an appropriate correction or refund where warranted.</p>
<h2>8. Refunds and Reversals</h2>
<p>Refund eligibility is governed by applicable Philippine law and our Return &amp; Refund Policy.</p>
<p>Where a refund is approved or required, we will initiate it through an appropriate available channel without unreasonable delay.</p>
<p>The time required for funds to become available may depend on the relevant payment provider, bank, card issuer, or payment method.</p>
<p>We will assist customers with legitimate refund and reversal inquiries and will not deny statutory remedies solely because a third-party payment provider is involved.</p>
<h2>9. Payment Security</h2>
<p>We use reasonable security controls designed to protect customer transactions and payment information.</p>
<p>Customers should use only our official website and authorized payment instructions.</p>
<p>Our support representatives will never ask customers to disclose their bank passwords, payment PINs, or one-time passwords.</p>
<p>Where payment credentials are entered directly into a third-party payment interface, those credentials are processed under the applicable provider's security and privacy controls.</p>
<h2>10. Fraud Prevention</h2>
<p>We may review suspicious transactions, request reasonable verification, or temporarily suspend fulfillment where necessary to investigate potential fraud.</p>
<p>Where an order cannot be lawfully fulfilled, we will communicate the relevant outcome and arrange any refund to which the customer is entitled.</p>
<p>Fraud-prevention procedures will be implemented consistently with consumer protection and data privacy requirements.</p>
<h2>11. Payment Disputes</h2>
<p>Customers should contact us first regarding payment discrepancies, unrecognized transactions, or payment confirmations that do not match their orders.</p>
<p>We will review available records and coordinate with the relevant payment provider.</p>
<p>Customers also retain the right to pursue appropriate remedies through their financial institution, payment provider, or competent regulatory authority.</p>
<h2>12. Contact Information</h2>
<p>${v.business.name}</p>
<p>${v.business.address}</p>
<p>${v.business.email}</p>
<p>${v.business.phone}</p>
`;

const BODIES: Record<string, (v: V) => Markup> = {
  "terms-and-conditions": terms,
  "privacy-policy": privacy,
  "shipping-policy": shipping,
  "return-refund-policy": returns,
  "payment-policy": payment,
};

export function policyContent(c: PackCtx, v: Policy): Markup | null {
  const body = BODIES[v.slug];
  if (!body) return null;
  return html`<div class="pp-co"><div class="pp-co-wrap"><article class="pp-policy">
<h1>${v.title}</h1>
<p class="pp-policy-meta">Version ${v.version}${v.effective_date ? html` &middot; Effective ${v.effective_date}` : ""}</p>
<p class="pp-policy-meta">Seller: ${v.business.name}</p>
${body(v)}
<nav class="pp-policy-nav" aria-label="Store policies">
<h2>All store policies</h2>
<ul>${c.policy_links.map((l) => html`<li><a href="${l.path}">${l.label}</a></li>`)}</ul>
</nav>
</article></div></div>`;
}

/** policy.html: base.html with its policy popup left out (the page is the policy). */
export function policyDocument(c: PackCtx, v: Policy): Markup | null {
  const content = policyContent(c, v);
  return content ? packDocument(c, { title: v.title, content, noPolicyPopup: true }) : null;
}
