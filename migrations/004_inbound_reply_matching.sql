CREATE INDEX IF NOT EXISTS messages_reply_match_idx
  ON messages (to_number, submitted_at DESC)
  WHERE status = 'carrier_submitted' AND submitted_at IS NOT NULL;

WITH matches AS (
  SELECT DISTINCT ON (i.id)
         i.id AS inbound_id,
         m.id AS message_id,
         m.callback_url
    FROM inbound_messages i
    JOIN messages m
      ON m.to_number = i.from_number
     AND m.status = 'carrier_submitted'
     AND m.submitted_at IS NOT NULL
     AND m.submitted_at <= i.received_at
     AND m.submitted_at >= i.received_at - interval '7 days'
   WHERE i.matched_message_id IS NULL
   ORDER BY i.id, m.submitted_at DESC
)
UPDATE inbound_messages i
   SET matched_message_id = matches.message_id,
       callback_url = matches.callback_url,
       callback_status = CASE
         WHEN matches.callback_url IS NOT NULL AND i.callback_status = 'not_configured' THEN 'pending'
         ELSE i.callback_status
       END,
       updated_at = now()
  FROM matches
 WHERE i.id = matches.inbound_id;
