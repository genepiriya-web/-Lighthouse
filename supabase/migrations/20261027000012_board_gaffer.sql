-- Daily job board: the Excel's GAFFER column is per day too (a gaffer can change between days). Gene, 27 Oct 2026.
alter table board_entries add column gaffer text;
