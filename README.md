# TapLocal Insights (12)

BUILD PROJECT: TAPLOCAL DIGITAL / TAPLOCAL SMARTPLAQUE PLATFORM



IMPORTANT:

This is not merely an NFC plaque website or an analytics dashboard.



TapLocal is a software-enabled physical-to-digital customer engagement platform for local businesses.



The physical TapLocal SmartPlaque is the customer touchpoint.

TapLocal SmartLink is the routing/tracking layer.

The business portal is the management and analytics layer.

TapLocal Copilot is the intelligence and recommendation layer.

The business owner always retains control over what their plaques do.



CORE PRODUCT PHILOSOPHY:



"You decide what you want customers to do.

TapLocal shows you how they respond."



The platform needs to help a local business answer:



- What are my customers doing?

- Which plaques are actually being used?

- Where are customers interacting?

- When are they interacting?

- Are they more interested in Google Reviews, Instagram, menus, bookings, offers, etc.?

- Which physical placement works best?

- What changed compared with last week/month?

- Did moving a plaque help?

- Is my Google review activity improving?

- Are my followers increasing?

- What should I test next?

- Should I move a plaque?

- Should I change Google to Instagram?

- Should I add another plaque?

- What should I do next?



The owner should NOT have to understand analytics software.



TapLocal Copilot should interpret the data and give practical answers and optional recommendations.



==================================================

1. PRODUCT SURFACES

==================================================



Build five logical surfaces:



1. taplocaldigital.com

Public marketing website.



2. activate.taplocaldigital.com

Mobile-first plaque activation wizard.



3. app.taplocaldigital.com

Business owner portal and TapLocal Copilot.



4. go.taplocaldigital.com

Fast SmartLink redirect service used by NFC and QR.



5. admin.taplocaldigital.com

Private TapLocal internal admin/provisioning/support system.



These can initially exist in one codebase and deployment if needed, but architect them as separate application areas/subdomains.



==================================================

2. RECOMMENDED TECHNOLOGY

==================================================



Frontend:

Next.js

React

TypeScript

Tailwind CSS

shadcn/ui or equivalent polished component library



Backend/database:

Supabase

PostgreSQL

Supabase Auth

Supabase Row Level Security



Redirect layer:

Cloudflare Worker or equivalent edge function



Authentication:

Passwordless email OTP.

Avoid requiring the business owner to create a password during initial onboarding.



AI:

OpenAI Responses API with function/tool calling.



IMPORTANT:

The AI must NEVER invent business numbers.



The backend/database is the source of truth.



The AI should call structured backend tools, receive real data, interpret that data and respond.



Emails:

Resend/Postmark or equivalent.



Monitoring:

Sentry or equivalent.



Later integrations:

Google Business Profile

Instagram professional account APIs

Booking systems

CRM

POS

Shopify/WooCommerce

Webhooks



==================================================

3. THREE DIFFERENT USERS

==================================================



A. END CUSTOMER



This is the restaurant/salon/hotel/etc. customer's customer.



They should have almost ZERO friction.



Their experience should be:



See plaque

→ Tap NFC or scan QR

→ Arrive at Google / Instagram / booking / menu / destination



Do NOT force them through a TapLocal splash screen.



TapLocal should normally be invisible during the customer journey.



B. BUSINESS OWNER



They activate plaques, choose actions, view results, ask TapLocal questions, receive recommendations and approve changes.



C. TAPLOCAL ADMINISTRATOR



TapLocal staff provision hardware, troubleshoot plaques, manage accounts, see system health and handle inventory.



==================================================

4. CORE DATA MODEL

==================================================



Create a proper relational database.



TABLE: profiles

- id

- user_id

- first_name

- last_name

- phone optional

- created_at



TABLE: businesses

- id

- name

- industry

- timezone

- primary_goal

- status

- created_at

- updated_at



Example industries:

restaurant

cafe

salon

spa

hotel

retail

dentist

clinic

contractor

hvac

automotive

gym

other



TABLE: business_members

- id

- business_id

- user_id

- role

- created_at



Roles:

owner

admin

manager

viewer



TABLE: locations

- id

- business_id

- name

- address

- city

- province_state

- country

- timezone

- active



TABLE: plaques

- id

- plaque_code

- public_slug

- activation_token_hash

- business_id nullable before claim

- location_id nullable before claim

- product_type

- style

- base_type

- plaque_name

- placement_type

- status

- activated_at

- created_at



Example plaque_code:

TL-001247



Example product_type:

google_review

instagram

generic

dual

custom



Example placement_type:

front_counter

checkout

table

reception

entrance

exit

bar

waiting_area

hotel_room

vehicle

other



Plaque status:

inventory

packed

sold

claimed

active

paused

faulty

replaced

retired



TABLE: goals

- id

- business_id

- goal_type

- priority

- active

- created_at



Goal examples:

google_reviews

instagram_growth

bookings

leads

menu_visits

website_visits

directions

offer_redemptions

loyalty

custom



TABLE: destinations

- id

- business_id

- plaque_id

- destination_type

- url

- metadata jsonb

- active

- effective_from

- effective_to

- created_at



Destination types:

google_review

instagram

facebook

website

menu

booking

directions

call

quote

coupon

loyalty

custom



IMPORTANT:

Never simply overwrite destination history.



When a destination changes:

close the old destination by setting effective_to,

create a new destination row.



This is necessary to compare results before and after strategy changes.



TABLE: plaque_placement_history

- id

- plaque_id

- location_id

- placement_type

- placement_name

- effective_from

- effective_to

- changed_by_user_id

- reason optional



TABLE: events

- id

- business_id

- location_id

- plaque_id

- event_type

- source_type

- intent_type

- destination_type

- destination_id

- device_family optional

- browser_family optional

- coarse_country optional

- coarse_region optional

- anonymous_visitor_key optional

- occurred_at

- metadata jsonb



Event types:

interaction

redirect_success

redirect_failure

lead_started

lead_submitted

coupon_claimed

coupon_redeemed

booking_started

booking_completed

custom_conversion



source_type:

nfc

qr



intent_type:

review

social

menu

booking

lead

directions

website

promotion

loyalty

custom



TABLE: integrations

- id

- business_id

- integration_type

- external_account_id

- status

- scopes

- encrypted_credentials/reference

- connected_at

- last_sync_at



Integrations:

google_business

instagram

booking_provider

shopify

woocommerce

crm

custom_webhook



TABLE: metric_snapshots

- id

- business_id

- location_id optional

- integration_id

- metric_type

- metric_value

- captured_at

- metadata



Metric types examples:

google_review_count

google_rating

instagram_followers

instagram_profile_views

bookings

revenue



TABLE: outcomes

- id

- business_id

- plaque_id optional

- destination_id optional

- outcome_type

- attribution_type

- value optional

- external_id optional

- occurred_at

- metadata



Attribution types:

direct

correlated

unknown



Outcome types:

lead

booking

coupon_redemption

purchase

new_review

new_follower

call

other



TABLE: experiments

- id

- business_id

- name

- hypothesis

- experiment_type

- primary_goal

- status

- started_at

- ended_at

- created_by_user_id



Experiment types:

placement

destination

cta

timing

plaque_comparison



TABLE: experiment_variants

- id

- experiment_id

- plaque_id

- configuration

- label



TABLE: recommendations

- id

- business_id

- recommendation_type

- title

- explanation

- evidence jsonb

- proposed_action jsonb

- confidence

- status

- created_at

- resolved_at



Recommendation statuses:

new

viewed

accepted

rejected

expired



TABLE: action_history

- id

- business_id

- plaque_id optional

- action_type

- previous_value jsonb

- new_value jsonb

- initiated_by

- approved_by_user_id optional

- created_at



initiated_by:

owner

copilot

admin

automation



TABLE: conversations

- id

- business_id

- user_id

- created_at

- updated_at



TABLE: conversation_messages

- id

- conversation_id

- role

- content

- tool_calls jsonb

- created_at



TABLE: subscriptions

- id

- business_id

- plan

- status

- started_at

- renews_at



==================================================

5. PLAQUE PROVISIONING

==================================================



TapLocal admin needs to be able to create plaques before sale.



ADMIN FEATURE:

"Create Plaques"



Input:

quantity

product type

style

base type

SKU



Example:

Create 100

Google Review

Smoky Marble

Clear Acrylic



For each plaque generate:



plaque code:

TL-001001



public slug:

random short non-sequential slug



public NFC SmartLink:

https://go.taplocaldigital.com/[public_slug]



public QR SmartLink:

Prefer separate tracking route if possible:

https://go.taplocaldigital.com/q/[public_slug]



NFC:

https://go.taplocaldigital.com/n/[public_slug]



PRIVATE activation token:

high entropy random token



Activation URL:

https://activate.taplocaldigital.com/[private-token]



Provide an export for manufacturing:



plaque_code

NFC_URL

QR_URL

ACTIVATION_URL

product_type

SKU



Generate printable activation QR assets.



IMPORTANT:

The public SmartLink and the private activation link are completely separate.



PUBLIC NFC/QR:

used by the end customer.



PRIVATE activation QR:

only included inside the business owner's package.



==================================================

6. SMARTLINK REDIRECT ENGINE

==================================================



This is one of the most important parts of the product.



Customer taps:



https://go.taplocaldigital.com/n/X8K2P4



Edge function should:



1. Validate public slug.

2. Find plaque.

3. Verify plaque is active.

4. Find active destination based on current date/time.

5. Create interaction event.

6. Record source = NFC.

7. Record current placement.

8. Record current configured intent.

9. Record destination.

10. Redirect immediately using HTTP 302/307.

11. Record redirect status asynchronously when practical.



QR should do the same but source = QR.



Customer should not notice TapLocal.



Performance target:

redirect should feel nearly instantaneous.



If plaque is unconfigured:

send owner/end user to a simple safe fallback page rather than broken link.



If plaque is paused:

show a neutral unavailable page.



==================================================

7. 60-SECOND BUSINESS ACTIVATION

==================================================



This must be mobile first.



Do not overwhelm the owner.



SCREEN 1:

"Activate Your TapLocal SmartPlaque"



Automatically recognize plaque via private activation token.



Display:

Plaque TL-001247

Google Review SmartPlaque



Button:

Get Started



SCREEN 2:

"What would you like customers to do?"



Large cards:



Leave a Google Review

Follow Us on Instagram

View Our Menu

Book an Appointment

Visit Our Website

Get Directions

Request a Quote

Claim an Offer

Custom Link



This creates the initial business goal + destination intent.



SCREEN 3:

Destination setup.



Google:

"Paste your Google review link"

Include help link.

Later provide business lookup.



Instagram:

"Enter your Instagram username"

Example @joespizza



Website/menu/booking:

URL field



Call:

phone number



SCREEN 4:

"Where will this plaque be placed?"



Cards:

Front Counter

Checkout

Table

Reception

Entrance

Exit

Bar

Waiting Area

Other



Then:

"Name this plaque"



Auto-suggest based on placement.



Example:

Front Counter



SCREEN 5:

Business information.



Business name

Location if needed



Keep this minimal.



SCREEN 6:

"Where should we send your TapLocal access code?"



Email field.



Send 6-digit OTP.



SCREEN 7:

Enter OTP.



SCREEN 8:

Success.



"Your SmartPlaque is Live"



Plaque:

Front Counter



Goal:

More Google Reviews



Destination:

Google Reviews



Status:

Active



Buttons:

Test My Plaque

Open TapLocal



Target:

A normal owner should be able to activate in approximately 60 seconds.



Do not require:

native app download

manual NFC programming

mandatory Google OAuth

mandatory Instagram OAuth

credit card

long registration form



==================================================

8. BUSINESS PORTAL UX

==================================================



The owner experience should NOT primarily feel like Google Analytics.



Conversation and interpretation should be primary.



HOME SCREEN:



"Good morning, Joe's Pizza 👋"



Summary:



86 customer interactions this week

↑19%



Front Counter performed best.



Google Review activity increased.



Then a large Copilot input:



"Ask TapLocal anything about your business…"



Suggested questions:



What changed this week?

Which plaque performs best?

Where should I put another plaque?

Are customers more interested in reviews or Instagram?

Did moving my plaque help?

What should I improve?

How are my Google reviews doing?

Give me a plan for this month.



Below conversation:



"TapLocal noticed"



Example recommendation card:



Your Front Counter generated 2.4× more Google Review interactions than your table plaques.



Suggested next step:

Test a second review plaque near the exit for 14 days.



Buttons:

Run This Test

Ask Why

Not Now



Then:



YOUR PLAQUES



Front Counter

Google Reviews

251 interactions

↑24%



Table 1

Instagram

103

↑12%



Table 2

Instagram

81

↓5%



Entrance

Menu

48

↑8%



==================================================

9. NAVIGATION

==================================================



Mobile bottom navigation:



Home

Plaques

Results

Activity

Settings



Desktop sidebar can include:



Home

Plaques

Results

Experiments

Recommendations

Integrations

Reports

Activity

Settings



Do not make navigation overwhelming.



==================================================

10. PLAQUE DETAIL SCREEN

==================================================



Show:



Plaque name

Plaque ID

Status

Physical placement

Current action

Current destination



Metrics:

Interactions

NFC taps

QR scans

Estimated unique visitors

Destination opens

Most active time

Trend vs previous period



Controls:



Change Action

Change Destination

Rename Plaque

Change Placement

Pause Plaque

View History

Start Test



Also show:



"Placement History"



Example:



Front Counter

Sept 3 – present



Table

Aug 15 – Sept 3



This allows before/after analysis.



==================================================

11. RESULTS SCREEN

==================================================



Heading:



"How Customers Are Engaging"



Avoid analytics jargon wherever possible.



Show:



Customer Interactions

NFC Taps

QR Scans

Estimated Unique Visitors



Then:



"What Customers Wanted to Do"



Reviews 54%

Instagram 27%

Menu 12%

Bookings 7%



Then:



"Where Customers Engaged"



Front Counter

Tables

Entrance

Bar

etc.



Then:



"When Customers Engage"



day of week

time of day



Then:



"Business Results"



IMPORTANT:

Clearly separate three levels of certainty.



A. OBSERVED

TapLocal directly observed.



Examples:

294 Google Review destination visits

124 Instagram destination visits

42 menu visits



B. DIRECTLY ATTRIBUTED

TapLocal can prove the outcome.



Examples:

14 TapLocal lead forms submitted

7 coupon redemptions

9 confirmed bookings via supported integration



C. CORRELATED

External metric changed during period but individual attribution cannot be proven.



Examples:

Google reviews +14 during period

Instagram followers +28 during period



Never claim a Google review was caused by a specific NFC tap unless the platform provides direct attribution.



==================================================

12. GOOGLE BUSINESS INTEGRATION

==================================================



This is OPTIONAL after initial setup.



Dashboard prompt:



"Connect Google Business Profile for deeper results"



Once connected store authorized locations and periodically snapshot:



Google review count

Google rating

recent reviews if permitted

timestamps

other allowed business profile data



Example UI:



Google Review Page Visits

291



Google Reviews

184 → 198

+14 during selected period



Google Rating

4.5 → 4.6



Copy should say:



"14 new Google reviews during this period."



NOT:



"TapLocal generated 14 reviews."



==================================================

13. INSTAGRAM INTEGRATION

==================================================



Optional after setup.



"Connect Instagram Professional Account"



Where API permissions allow, collect:



follower count

profile/account metrics

available insights



UI:



TapLocal Instagram Profile Visits

124



Followers

2,190 → 2,218



+28 during selected period



Do not claim those exact followers were caused by TapLocal unless directly attributable.



==================================================

14. TAPLOCAL-CONTROLLED DESTINATIONS

==================================================



Later build simple destination experiences controlled by TapLocal.



Examples:



Request a Quote

Contact Form

Coupon

Loyalty Signup

Email Signup

Book Callback

Event RSVP

Offer Landing Page



These are important because TapLocal can observe deeper funnels.



Example:



Tap

→ Quote Page Opened

→ Form Started

→ Form Submitted

→ Lead Created

→ Business marks Won

→ Revenue Value



Dashboard:



67 Quote Visits

14 Leads

5 Won

$8,420 Attributed Value



==================================================

15. TAPLOCAL COPILOT

==================================================



This is a major differentiator.



The AI is NOT the data source.



DATABASE = FACTS

ANALYTICS = CALCULATIONS

AI = INTERPRETATION + RECOMMENDATIONS + CONTROLLED ACTIONS



The AI should use structured tools/functions.



Initial READ tools:



get_business_context

get_business_goals

get_active_plaques

get_plaque_details

get_plaque_performance

compare_plaque_performance

compare_periods

compare_placements

get_intent_breakdown

get_time_breakdown

get_destination_history

get_placement_history

get_google_results

get_instagram_results

get_business_outcomes

get_experiment_results

get_recent_activity

diagnose_plaque

get_recommendations



Example:



Owner:

"Why did I get more reviews this week?"



Copilot must call:

get_plaque_performance

get_google_results

compare_periods



Backend returns facts.



Then AI explains:



"Your Google review-page interactions increased from 54 to 78. Most of the increase came from the Front Counter on Friday and Saturday. Your Google Business Profile also gained six reviews during the same period. Individual review attribution is not available, so I cannot say which specific visits produced those reviews."



This is the desired style.



==================================================

16. COPILOT WRITE TOOLS

==================================================



Later add permissioned actions:



propose_change_destination

apply_change_destination



propose_change_placement

apply_change_placement



rename_plaque



pause_plaque



resume_plaque



set_business_goal



start_experiment



end_experiment



create_coupon



create_lead_form



generate_report



schedule_report



IMPORTANT:



Important changes require explicit approval.



Flow:



Owner:

"Change Table 2 to Instagram."



Copilot:



"Table 2 currently sends customers to Google Reviews.



Proposed change:

Google Reviews → Instagram



This will not affect your Front Counter plaque.



[Approve & Change]

[Cancel]"



Only after approval should backend update destination.



Create action_history entry.



==================================================

17. COPILOT SYSTEM INSTRUCTION

==================================================



Use a system prompt based on:



"You are TapLocal Copilot, an AI assistant for local businesses using TapLocal SmartPlaques.



Your job is to help business owners understand physical-to-digital customer interactions and make practical decisions.



Always retrieve business facts using TapLocal tools before making claims about performance.



Distinguish clearly between:



1. observed TapLocal activity,

2. directly attributed outcomes,

3. correlated external changes.



Never claim that an individual Google review, Instagram follower or other external action came from TapLocal unless direct

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://taplocaldigital.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/0bc38c56-d190-4759-a095-247bf1c698ce).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
