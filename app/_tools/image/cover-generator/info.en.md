### What is this?

Cover Generator is a low-cost idea tool for exploring distinct, text-free artwork directions for textbook covers.

Choose the audience and subject, then add a few optional theme or style keywords. You do not need to write a detailed art brief: a small vision-capable planning model expands the short input into several different visual concepts. Reference covers are optional and guide broad audience character, palette, finish, and energy without being copied as layouts.

The output is artwork only. Do not ask for titles, grade numbers, logos, labels, badges, or other typography; those elements will be added later in InDesign. The `?` button above the keywords explains how to phrase a useful short input.

The two available low-cost image models are FLUX.2 Klein, the default 512 px option, and Gemini Flash Lite, an alternative 1K option with a different visual style. The concept planner uses `mistralai/mistral-small-2603`, which can understand both Czech and English text and inspect optional reference images. This tool creates ideas only; layer separation belongs in Layer Splitter.

### How does it work?

The audience, subject, optional keywords, artwork-focused reference crops, and any preferred earlier concept first go to the protected concept planner. It summarizes references into broad style guidance and returns exactly two or four structurally different plans. The image model then receives one different plan per image and does not receive the raw references by default, preventing a reference cover from becoming a repeated template. FLUX uses an independent random seed for each result; Gemini does not expose seed control. Failed image slots are retried once, and planner and image usage costs plus generation IDs are included in the ZIP report.
