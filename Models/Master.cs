namespace back_end.Models
{
    public class Master
    {
        public string SysID { get; set; } = string.Empty;
        public Dictionary<string, object?>? Params { get; set; }
    }
}
