using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using System.Data;
using back_end.Models;
using Newtonsoft.Json.Linq;

namespace back_end.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class MasterController : ControllerBase
    {
        private readonly string _dbcon;
        private readonly IWebHostEnvironment _env;

        public MasterController(IConfiguration configuration, IWebHostEnvironment env)
        {
            _dbcon = configuration.GetSection("DBCon").Value!;
            _env   = env;
        }

        // Universal SP endpoint — reads and writes.
        // SPs returning rows send them as JSON array; otherwise { success: true }.
        [HttpPost("sp")]
        public ActionResult sp([FromBody] Master udata)
        {
            var tb = new DataTable();
            using var con = new SqlConnection(_dbcon);
            using var cmd = new SqlCommand(udata.SysID, con)
            {
                CommandType = CommandType.StoredProcedure
            };
            AddParams(cmd, udata.Params);
            con.Open();
            using var rdr = cmd.ExecuteReader();
            tb.Load(rdr);

            return tb.Rows.Count > 0 ? Ok(tb) : Ok(new { success = true });
        }

        // Image upload: saves file as wwwroot/Items_img/{CODE}.png
        [HttpPost("upload")]
        public async Task<ActionResult> upload([FromForm] string code, IFormFile file)
        {
            if (string.IsNullOrWhiteSpace(code))
                return BadRequest(new { error = "Product code required" });

            if (file == null || file.Length == 0)
                return BadRequest(new { error = "No file selected" });

            var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
            var allowed = new[] { ".png", ".jpg", ".jpeg", ".gif", ".webp" };
            if (!allowed.Contains(ext))
                return BadRequest(new { error = "Only image files allowed (png/jpg/gif/webp)" });

            var folder   = Path.Combine(_env.WebRootPath, "Items_img");
            Directory.CreateDirectory(folder);
            var savePath = Path.Combine(folder, code.ToUpper() + ".png");

            using var stream = System.IO.File.Create(savePath);
            await file.CopyToAsync(stream);

            return Ok(new { success = true, path = "/Items_img/" + code.ToUpper() + ".png" });
        }

        private static void AddParams(SqlCommand cmd, Dictionary<string, object?>? parms)
        {
            if (parms == null) return;
            foreach (var (key, val) in parms)
            {
                object sqlVal = val is JValue jv
                    ? (jv.Value ?? (object)DBNull.Value)
                    : (val ?? (object)DBNull.Value);
                cmd.Parameters.AddWithValue("@" + key, sqlVal);
            }
        }
    }
}
