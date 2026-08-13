CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `checklist_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`machine_id` integer NOT NULL,
	`label` text NOT NULL,
	`hint` text NOT NULL,
	`sort_order` integer NOT NULL,
	FOREIGN KEY (`machine_id`) REFERENCES `machines`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `checksheet_answers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`checksheet_id` integer NOT NULL,
	`checklist_item_id` integer NOT NULL,
	`result` text NOT NULL,
	`category` text,
	FOREIGN KEY (`checksheet_id`) REFERENCES `checksheets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`checklist_item_id`) REFERENCES `checklist_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `checksheets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`machine_id` integer NOT NULL,
	`technician_user_id` integer NOT NULL,
	`work_order_code` text NOT NULL,
	`status` text NOT NULL,
	`submitted_at` text NOT NULL,
	`is_seed` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`machine_id`) REFERENCES `machines`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`technician_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `checksheets_code_unique` ON `checksheets` (`code`);--> statement-breakpoint
CREATE TABLE `findings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`checksheet_id` integer NOT NULL,
	`checklist_item_id` integer NOT NULL,
	`machine_id` integer NOT NULL,
	`title` text NOT NULL,
	`item_label` text NOT NULL,
	`category` text NOT NULL,
	`severity` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`checksheet_id`) REFERENCES `checksheets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`checklist_item_id`) REFERENCES `checklist_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`machine_id`) REFERENCES `machines`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `machines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`area` text NOT NULL,
	`pm_interval_label` text NOT NULL,
	`last_pm_date` text NOT NULL,
	`due_label` text NOT NULL,
	`due_tone` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `machines_slug_unique` ON `machines` (`slug`);--> statement-breakpoint
CREATE TABLE `part_catalog` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category` text NOT NULL,
	`part_name` text NOT NULL,
	`typical_cost_idr` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `part_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`finding_id` integer NOT NULL,
	`checksheet_id` integer NOT NULL,
	`machine_id` integer NOT NULL,
	`vendor_id` integer NOT NULL,
	`part_name` text NOT NULL,
	`cost_idr` integer NOT NULL,
	`status` text NOT NULL,
	`email_subject` text NOT NULL,
	`email_body` text NOT NULL,
	`drafted_by` text NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	`sent_at` text,
	`is_seed` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`finding_id`) REFERENCES `findings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`checksheet_id`) REFERENCES `checksheets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`machine_id`) REFERENCES `machines`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `part_requests_code_unique` ON `part_requests` (`code`);--> statement-breakpoint
CREATE TABLE `record_embeddings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` integer NOT NULL,
	`embedding` blob NOT NULL,
	`model_name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`vendor_id` integer,
	FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE TABLE `vendors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL
);
