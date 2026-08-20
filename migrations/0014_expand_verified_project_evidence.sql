UPDATE master_resume_profiles
SET profile_json = json_set(
  profile_json,
  '$.projects[0].bullets', json_array(
    'Analyzed sales data with SQL and built interactive Power BI views covering revenue, profit, category, monthly, yearly, and regional performance.',
    'Created a 15-day sales forecast with Power BI forecasting tools to support inventory planning.'
  ),
  '$.projects[1].bullets', json_array(
    'Cleaned sales data and built Excel pivot tables, charts, and reports across customer demographics, order status, sales channels, and revenue.',
    'Identified key buyer segments, top revenue states and channels, and recommended targeted ads, discounts, and coupons.'
  ),
  '$.projects[0].verifiedSource', 'https://github.com/rizz1406/Superstore-Sales-Analysis',
  '$.projects[1].verifiedSource', 'https://github.com/rizz1406/My-Galaxy-Store-Sales-Analysis'
), updated_at = CURRENT_TIMESTAMP
WHERE id = 1;
