var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllersWithViews().AddNewtonsoftJson();

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}

app.UseHttpsRedirection();

// Serve SPA from wwwroot — index.html at "/"
app.UseDefaultFiles();   // must be before UseStaticFiles
app.UseStaticFiles();

app.UseRouting();
app.UseAuthorization();

// API routes
app.MapControllers();

// Any unmatched route returns index.html (SPA fallback)
app.MapFallbackToFile("index.html");

app.Run();
