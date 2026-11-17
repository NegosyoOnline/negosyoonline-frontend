/* A storefront surface answer for tests: the shape of the backend's SiteOut. */
import type { Site } from "../src/lib/django.ts";

export const SITE: Site = {
  id: "site_1", template: "sante", display_name: "Demo Store", accent_color: "#0a7d3c",
  facebook_url: "", instagram_url: "", tiktok_url: "",
  business: { registered_name: "", tin: "", dti_business_number: "", contact_email: "", contact_mobile: "",
    has_seal: false },
  distributor: { name: "Demo Store", mobile: "", has_photo: false },
  policy_links: [], free_shipping_banner: false, meta_pixel_id: "", custom_host: "",
};

export const FILLED: Site = {
  ...SITE, display_name: "Nena's Wellness & Barley",
  facebook_url: "https://facebook.com/demostore", instagram_url: "https://instagram.com/demostore",
  tiktok_url: "https://tiktok.com/@demostore",
  business: { registered_name: "Nena Santos Trading", tin: "123-456-789-00000", dti_business_number: "1234567",
    contact_email: "hello@demo-store.example.test", contact_mobile: "09171234567", has_seal: false },
  distributor: { name: "Nena Santos", mobile: "+639171234567", has_photo: false },
};
