### What is this?

Cover Generator creates new textbook-cover artwork from two or three existing covers that define a visual series.

Choose a style and generation quality, describe the new subject, and generate two or four concepts. Upvoting a concept uses it as an additional direction reference for the next batch; unwanted concepts can be deleted.

Ignore text in reference images sends artwork-focused crops so book titles, grade labels and publisher logos are less likely to be copied. This may help generate cleaner cover art.

Optional Shutterstock research accepts one search phrase or direct Shutterstock URL per row. Previews are unlicensed, watermarked research references; every used source must be licensed before publication.

After selecting a concept, automatic stemming detects essential objects, creates an AI-recreated 2K cover master, and regenerates each detected object as a separate isolated 2K asset. These are new AI recreations, not pixel-perfect extracted layers.

The ZIP contains concepts, the 2K master, stems, project metadata, and a Markdown report with each task’s model, seed, credits and Shutterstock source links.

### How does it work?

Reference images and the brief travel through a protected server route. Fast concepts use FLUX.2 Klein 4B at 512 px; high-quality concepts use FLUX.2 Pro at 1K. Automatic object detection uses Mistral Small 2603, while the 2K master and isolated stems use FLUX.2 Pro. Failed concept slots are retried once, and successful parallel results are preserved. OpenRouter usage costs and generation IDs are stored for the ZIP report.
