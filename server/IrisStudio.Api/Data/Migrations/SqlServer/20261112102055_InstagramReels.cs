using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IrisStudio.Api.Data.Migrations.SqlServer
{
    /// <inheritdoc />
    public partial class InstagramReels : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "InstagramReels",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Url = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Shortcode = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    ThumbnailFile = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: false),
                    ThumbnailType = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    Lqip = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    SortOrder = table.Column<int>(type: "int", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    DeletedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InstagramReels", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_InstagramReels_DeletedAtUtc_SortOrder",
                table: "InstagramReels",
                columns: new[] { "DeletedAtUtc", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "UX_Reel_Shortcode_Active",
                table: "InstagramReels",
                column: "Shortcode",
                unique: true,
                filter: "[DeletedAtUtc] IS NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "InstagramReels");
        }
    }
}
