ALTER TABLE `events`
  ADD COLUMN IF NOT EXISTS `causal_chain_id` varchar(128) DEFAULT NULL AFTER `workflow_outcome`,
  ADD COLUMN IF NOT EXISTS `related_interaction_id` varchar(128) DEFAULT NULL AFTER `causal_chain_id`,
  ADD COLUMN IF NOT EXISTS `cause_event_id` varchar(64) DEFAULT NULL AFTER `related_interaction_id`,
  ADD COLUMN IF NOT EXISTS `parent_event_id` varchar(64) DEFAULT NULL AFTER `cause_event_id`;

CREATE INDEX IF NOT EXISTS `idx_causal_chain_id` ON `events` (`causal_chain_id`);
CREATE INDEX IF NOT EXISTS `idx_related_interaction_id` ON `events` (`related_interaction_id`);
CREATE INDEX IF NOT EXISTS `idx_cause_event_id` ON `events` (`cause_event_id`);
CREATE INDEX IF NOT EXISTS `idx_parent_event_id` ON `events` (`parent_event_id`);
