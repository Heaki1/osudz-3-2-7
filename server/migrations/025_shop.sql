-- 025_shop.sql — DZP ledger, Shop items, artwork, ownership, and transfer history.
--
-- The Shop is intentionally separate from DZPP:
--   * DZPP remains the competitive ranking system.
--   * DZP is a spendable community currency derived from finalized challenge results.
--   * Shop purchases never modify round_dzpp.
--
-- The current season number is not stored here. The existing application derives
-- season from round_number (SEASON_SIZE = 3). Each ledger entry stores the season
-- it belongs to, so historical entries remain readable after a seasonal reset.
--
-- Do not add BEGIN/COMMIT — the migration runner wraps each file in one transaction.

-- ── DZP ledger ────────────────────────────────────────────────────────────────
--
-- This is append-only accounting. Every balance-changing event gets a row.
-- The current spendable balance is calculated from the current season's rows;
-- it is deliberately not stored as a mutable balance column.
--
-- user_id is nullable with ON DELETE SET NULL so deleting an account cannot
-- erase the accounting history.
--
-- reference_id is an operation-level idempotency key. For challenge rewards
-- it identifies the finalized round reward for that user.
-- Corrections may reuse the same reference_id because multiple legitimate
-- corrections to one finalized reward are allowed.

CREATE TABLE dzp_ledger (
  id               bigserial PRIMARY KEY,
  user_id          integer REFERENCES users(id) ON DELETE SET NULL,
  round_id         integer REFERENCES rounds(id) ON DELETE SET NULL,
  item_id          text,
  season           integer      NOT NULL,
  amount_dzp       integer      NOT NULL,
  transaction_type text         NOT NULL,
  reference_id     text,
  description      text         NOT NULL,
  created_at       timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT dzp_ledger_transaction_type_valid
    CHECK (
      transaction_type IN (
        'challenge_reward',
        'challenge_reward_adjustment',
        'purchase',
        'steal_purchase',
        'steal_compensation',
        'refund',
        'admin_adjustment'
      )
    ),

  CONSTRAINT dzp_ledger_season_positive
    CHECK (season > 0),

  CONSTRAINT dzp_ledger_amount_nonzero
    CHECK (amount_dzp <> 0)
);

COMMENT ON TABLE dzp_ledger IS
  'Append-only DZP accounting ledger. Historical rows are never deleted.';

COMMENT ON COLUMN dzp_ledger.season IS
  'The season the balance change belongs to. Closed-season rows remain historical and do not become current-season spendable balance.';

COMMENT ON COLUMN dzp_ledger.amount_dzp IS
  'Signed amount. Positive earns/receives DZP; negative spends DZP.';

COMMENT ON COLUMN dzp_ledger.reference_id IS
  'Operation-level idempotency key. Challenge rewards are uniquely protected; corrections may legitimately reuse the same reference.';

COMMENT ON COLUMN dzp_ledger.round_id IS
  'The originating round when the ledger event belongs to a challenge result or correction.';

COMMENT ON COLUMN dzp_ledger.item_id IS
  'Shop item associated with a purchase, steal, compensation, or refund. Nullable for non-Shop transactions.';

-- Only the original finalized reward is idempotent.
-- This deliberately does NOT include challenge_reward_adjustment, because
-- one finalized round may need multiple legitimate corrections over time.
CREATE UNIQUE INDEX dzp_ledger_reward_idempotency
  ON dzp_ledger (user_id, reference_id)
  WHERE transaction_type = 'challenge_reward'
    AND reference_id IS NOT NULL;

CREATE INDEX dzp_ledger_user_created
  ON dzp_ledger (user_id, created_at DESC);

CREATE INDEX dzp_ledger_season_user
  ON dzp_ledger (season, user_id, created_at DESC);

CREATE INDEX dzp_ledger_round
  ON dzp_ledger (round_id);

CREATE INDEX dzp_ledger_item
  ON dzp_ledger (item_id);

-- ── Shop items ────────────────────────────────────────────────────────────────
--
-- Item ids are stable application-facing identifiers such as "best-algerian".
-- Lifecycle is stored; viewer state such as "owned by you", "stealable",
-- and "insufficient funds" is derived at request time.

CREATE TABLE shop_items (
  id                   text PRIMARY KEY,
  name                 text        NOT NULL,
  description          text        NOT NULL,
  category             text        NOT NULL,
  ownership_type       text        NOT NULL,
  lifecycle            text        NOT NULL DEFAULT 'draft',
  profile_slot         text,
  display_order        integer     NOT NULL DEFAULT 0,
  initial_price_dzp    integer     NOT NULL,
  current_price_dzp    integer,

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT shop_items_category_valid
    CHECK (
      category IN (
        'title',
        'badge',
        'frame',
        'username_decoration',
        'profile_decoration'
      )
    ),

  CONSTRAINT shop_items_ownership_type_valid
    CHECK (ownership_type IN ('normal', 'stealable')),

  CONSTRAINT shop_items_lifecycle_valid
    CHECK (lifecycle IN ('draft', 'ready', 'active', 'retired')),

  CONSTRAINT shop_items_profile_slot_valid
    CHECK (
      profile_slot IS NULL
      OR profile_slot IN (
        'title',
        'frame',
        'badge',
        'username_decoration'
      )
    ),

  CONSTRAINT shop_items_initial_price_positive
    CHECK (initial_price_dzp > 0),

  CONSTRAINT shop_items_price_shape_valid
    CHECK (
      (ownership_type = 'normal' AND current_price_dzp IS NULL)
      OR
      (ownership_type = 'stealable' AND current_price_dzp IS NOT NULL AND current_price_dzp >= initial_price_dzp)
    )
);

COMMENT ON TABLE shop_items IS
  'Catalog of player-facing Shop items. Retired items remain stored so existing ownership survives.';

COMMENT ON COLUMN shop_items.initial_price_dzp IS
  'Original acquisition price. For stealable titles this is also the launch price for the title chain and never changes.';

COMMENT ON COLUMN shop_items.current_price_dzp IS
  'Current server-authoritative steal price for stealable titles. It is monotonically increased after successful steals and never seasonally reduced. NULL for normal items.';

COMMENT ON COLUMN shop_items.lifecycle IS
  'draft → ready → active → retired. Viewer-facing ownership/funds state is never stored here.';

CREATE INDEX shop_items_active_order
  ON shop_items (lifecycle, display_order, id);

CREATE INDEX shop_items_category_order
  ON shop_items (category, display_order, id);

-- ── Shop artwork ──────────────────────────────────────────────────────────────
--
-- Artwork is separate from item identity. An active item must have a valid
-- active artwork asset before the application can expose it as active.

CREATE TABLE shop_item_assets (
  id          bigserial PRIMARY KEY,
  item_id     text        NOT NULL REFERENCES shop_items(id) ON DELETE CASCADE,
  asset_type  text        NOT NULL,
  url         text        NOT NULL,
  alt_text    text        NOT NULL,
  is_active   boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT shop_item_assets_type_valid
    CHECK (asset_type IN ('png', 'webp', 'svg')),

  CONSTRAINT shop_item_assets_url_nonempty
    CHECK (length(trim(url)) > 0),

  CONSTRAINT shop_item_assets_alt_nonempty
    CHECK (length(trim(alt_text)) > 0)
);

COMMENT ON TABLE shop_item_assets IS
  'Artwork/assets belonging to Shop items. At most one asset is active for an item.';

COMMENT ON COLUMN shop_item_assets.is_active IS
  'The asset selected for the player-facing Shop. Application activation logic must not expose an item without a valid active asset.';

CREATE UNIQUE INDEX shop_item_assets_one_active
  ON shop_item_assets (item_id)
  WHERE is_active;

CREATE INDEX shop_item_assets_item
  ON shop_item_assets (item_id, created_at DESC);

-- ── Normal Shop ownership ─────────────────────────────────────────────────────
--
-- Normal purchases are permanent and survive seasonal resets.
-- Stealable title ownership is represented by shop_item_transfers instead,
-- because a title can change hands repeatedly.

CREATE TABLE user_shop_items (
  id                   bigserial PRIMARY KEY,
  item_id              text        NOT NULL REFERENCES shop_items(id) ON DELETE RESTRICT,
  user_id              integer     NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  acquisition_price_dzp integer    NOT NULL,
  acquired_at_season   integer     NOT NULL,
  acquired_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT user_shop_items_price_positive
    CHECK (acquisition_price_dzp > 0),

  CONSTRAINT user_shop_items_season_positive
    CHECK (acquired_at_season > 0),

  CONSTRAINT user_shop_items_unique_user_item
    UNIQUE (item_id, user_id)
);

COMMENT ON TABLE user_shop_items IS
  'Permanent ownership of normal Shop items. Seasonal resets do not remove rows.';

COMMENT ON COLUMN user_shop_items.acquisition_price_dzp IS
  'Immutable price actually paid by this owner.';

CREATE INDEX user_shop_items_user
  ON user_shop_items (user_id, acquired_at_season DESC);

CREATE INDEX user_shop_items_item
  ON user_shop_items (item_id);

-- ── Stealable title ownership history ────────────────────────────────────────
--
-- Every successful acquisition creates one row.
-- The current holder has lost_at = NULL.
-- Losing the title stamps lost_at and compensation_received_dzp.
--
-- This makes acquisition price immutable per owner and preserves the complete
-- ownership chain across seasons.

CREATE TABLE shop_item_transfers (
  id                         bigserial PRIMARY KEY,
  item_id                    text        NOT NULL REFERENCES shop_items(id) ON DELETE RESTRICT,
  user_id                    integer     NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  acquisition_price_dzp      integer     NOT NULL,
  season                     integer     NOT NULL,
  acquired_at                timestamptz NOT NULL DEFAULT now(),
  lost_at                    timestamptz,
  compensation_received_dzp  integer,

  CONSTRAINT shop_item_transfers_price_positive
    CHECK (acquisition_price_dzp > 0),

  CONSTRAINT shop_item_transfers_season_positive
    CHECK (season > 0),

  CONSTRAINT shop_item_transfers_compensation_valid
    CHECK (
      compensation_received_dzp IS NULL
      OR compensation_received_dzp >= 0
    ),

  CONSTRAINT shop_item_transfers_loss_order_valid
    CHECK (lost_at IS NULL OR lost_at >= acquired_at)
);

COMMENT ON TABLE shop_item_transfers IS
  'Complete ownership history for stealable Shop titles. The current holder is the row with lost_at IS NULL.';

COMMENT ON COLUMN shop_item_transfers.acquisition_price_dzp IS
  'Immutable amount this specific owner paid. Future compensation is based on this value, never a later price.';

COMMENT ON COLUMN shop_item_transfers.compensation_received_dzp IS
  'Amount paid to this owner when the title was subsequently stolen. NULL while still holding the title or when no compensation applied.';

-- A stealable title can have at most one current owner.
CREATE UNIQUE INDEX shop_item_transfers_one_current_owner
  ON shop_item_transfers (item_id)
  WHERE lost_at IS NULL;

CREATE INDEX shop_item_transfers_item_history
  ON shop_item_transfers (item_id, acquired_at DESC);

CREATE INDEX shop_item_transfers_user_history
  ON shop_item_transfers (user_id, acquired_at DESC);