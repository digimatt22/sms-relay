# SMS Cost Comparison: DigiColony SNS, AWS, and Twilio

Pricing checked 2026-07-22. Prices change; confirm them before a commercial decision.

## One-segment US outbound model

The table models one US outbound GSM-7 segment per logical message and excludes taxes, optional features, inbound replies, cloud application costs outside the messaging product, and one-time registration. It uses:

- AWS 10DLC: `$0.00883` per outbound segment (`$0.00581` base + `$0.00302` carrier example) plus a low-volume campaign and number at `$3/month`. AWS states rates vary by carrier and provides daily usage reports for actual price.
- Twilio 10DLC: `$0.0083` platform fee plus an illustrative `$0.0042` blended carrier fee, or `$0.0125` per outbound segment, plus a low-volume campaign at `$1.50/month` and a long-code number at `$1.15/month`.
- DigiColony lab transport: the currently configured Tello no-data/unlimited-minutes plan is advertised at `$8/month` and includes text. This is shown only to explain laboratory economics, not as a production option.

| Outbound segments/month | AWS estimate | Twilio estimate | DigiColony lab: 1 line | DigiColony lab: 3 lines |
|---:|---:|---:|---:|---:|
| 1,000 | $11.83 | $15.15 | $8 | $24 |
| 10,000 | $91.30 | $127.65 | $8 | $24 |
| 25,000 | $223.75 | $315.15 | $8 | $24 |
| 50,000 | $444.50 | $627.65 | $8 | $24 |
| 100,000 | $886.00 | $1,252.65 | $8 | $24 |

The DigiColony lab columns are not fully loaded costs. Production total is:

```text
monthly total = hub hosting/database/monitoring
              + gateway count × (eligible carrier line + hardware reserve + field support)
              + compliance/registration and operations
```

No eligible commercial SIM price, hosted infrastructure budget, support allocation, or platform selling price is yet approved in this repository. A defensible customer price cannot be inferred from the $8 lab line.

For planning only, if three production gateways cost `$20 each/month` for carrier connectivity plus hardware reserve and the hub/monitoring allocation is `$50/month`, the fully loaded infrastructure floor is about `$110/month` before staff/support and taxes. At that assumption, AWS becomes more expensive at roughly 12,100 one-segment outbound messages/month. Replace every assumption with quotes and observed costs before pricing the service.

## Why $300–$500 on AWS can happen

Using the AWS 10DLC example rate and an `$11/month` regular campaign plus number, `$300–$500/month` corresponds to approximately **32,700–55,400 outbound segments**. The spend is not inherently implausible.

It is high if Stratus sends far fewer logical notifications. Likely multipliers are:

- long messages split into multiple billable segments;
- Unicode/emoji or smart punctuation reducing capacity to UCS-2 limits;
- repeated recipients, retries, or fan-out topic subscriptions;
- carrier charges, inbound messages, 10DLC resources, or SMS Protect;
- multiple campaigns/numbers/regions;
- failed attempts, which AWS says can still be charged;
- non-SMS AWS services being included in the verbal total.

Request these exact records from Stratus before concluding the rate is wrong:

1. AWS Cost Explorer grouped by service, usage type, and region for three months.
2. AWS End User Messaging/SNS daily SMS usage reports with destination, price, status, and message ID.
3. Logical notification count versus billed message-part/segment count.
4. Average and p95 body length plus GSM-7 versus Unicode classification.
5. Origination type, active numbers/campaigns, inbound volume, failed sends, and retries.

## Important production constraint

Tello publishes an `$8/month` plan and says text is included, but its terms describe plans as residential/non-commercial, state that voice/text are for direct communication between individuals, and prohibit certain unattended or mass automated use. Therefore the present Tello setup is a development/test transport, not a production cost strategy for SwimSense or Stratus. Obtain written commercial/A2P authorization from an eligible carrier or IoT provider before rollout.

## Capability comparison

Twilio and AWS both support delivery status based on carrier receipts. Twilio supports inbound message webhooks, outbound status callbacks, Conversations APIs, SDKs, and broad system integration. AWS SNS supports delivery-status logging and HTTP/Lambda/SQS-style fan-out patterns, but SNS itself does not provide scheduled SMS and its conversation model is not equivalent to the workflow threads built here.

DigiColony's opportunity is not merely a lower SMS price. Its value is the combined private gateway fleet, client-owned workflow correlation, exact-key webhook isolation, consent evidence, handset delivery state where available, and replies that update SwimSense/Stratus without requiring the recipient to log in.

## Sources

- [AWS SNS SMS pricing](https://aws.amazon.com/sns/sms-pricing/)
- [AWS End User Messaging pricing](https://aws.amazon.com/end-user-messaging/pricing/)
- [AWS SNS FAQ: delivery receipts, multipart billing, and failed delivery](https://aws.amazon.com/sns/faqs/)
- [AWS 10DLC pricing example](https://aws.amazon.com/products/connect/customer/pricing/appendix/)
- [Twilio US SMS, carrier, and number pricing](https://www.twilio.com/en-us/sms/pricing/us)
- [Twilio A2P 10DLC fees](https://help.twilio.com/hc/en-us/articles/1260803965530-A2P-10DLC-Campaign-Registration-Guide)
- [Tello current plans](https://tello.com/buy/custom_plans/)
- [Tello terms of service](https://tello.com/terms)
