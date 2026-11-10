using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IrisStudio.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class SingleLessonConsultation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "ConsultationCompleted",
                table: "Users",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ConsultationCompleted",
                table: "Users");
        }
    }
}
