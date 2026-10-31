-- Each user's personal leaderboard of dishes, best first (position 0 = best).
-- Rewritten whole after each review; head-to-head duels decide the order.
create table taste.rankings (
    user_id  uuid    not null,
    position integer not null check (position >= 0),
    dish_id  text    not null,
    primary key (user_id, position),
    unique (user_id, dish_id)
);
