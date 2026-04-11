-- bot_commands command CHECK 제약에 auto_reply 추가
ALTER TABLE bot_commands DROP CONSTRAINT IF EXISTS bot_commands_command_check;

ALTER TABLE bot_commands ADD CONSTRAINT bot_commands_command_check
    CHECK (command IN (
        'run', 'execute', 'retry',
        'publish', 'save_draft',
        'extract_blog_id',
        'neighbor_request', 'discover_neighbors', 'visit_neighbors',
        'discover_and_visit', 'recommend_neighbors', 'sync_neighbors',
        'analyze_theme', 'feed_comment',
        'auto_reply'
    ));
