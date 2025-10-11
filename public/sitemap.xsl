<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:sitemap="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:xhtml="http://www.w3.org/1999/xhtml">

  <xsl:output method="html" encoding="UTF-8" indent="yes"/>

  <xsl:template match="/">
    <html lang="en">
      <head>
        <title>Sitemap</title>
        <meta charset="UTF-8"/>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap');
          body {
            font-family: 'Poppins', sans-serif;
            background: #04041d;
            color: #fff;
            margin: 2rem;
          }
          h1 {
            color: #b0c4ff;
            margin-bottom: 1rem;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            background: #151a2d;
            border: 1px solid white;
            border-radius: 8px;
            overflow: hidden;
          }
          th, td {
            padding: 0.75rem;
            border-bottom: 1px solid rgba(255,255,255,0.2);
            text-align: left;
          }
          th {
            background: #151a2d;
            color: #b0c4ff;
          }
          tr:nth-child(even) {
            background: rgba(255,255,255,0.05);
          }
          tr:hover {
            background: #dde4fb;
            color: #151a2d;
          }
          a {
            color: #b0c4ff;
            text-decoration: none;
          }
          a:hover {
            text-decoration: underline;
            color: #6c8bdc;
          }
          .meta {
            font-size: 0.9rem;
            margin-bottom: 1rem;
            color: #a8b2d1;
          }
        </style>
      </head>
      <body>
        <h1>XML Sitemap</h1>
        <p class="meta">This sitemap contains <xsl:value-of select="count(sitemap:urlset/sitemap:url)"/> URLs.</p>
        <table>
          <thead>
            <tr>
              <th>URL</th>
              <th>Last Modified</th>
            </tr>
          </thead>
          <tbody>
            <xsl:for-each select="sitemap:urlset/sitemap:url">
              <tr>
                <td><a href="{sitemap:loc}"><xsl:value-of select="sitemap:loc"/></a></td>
                <td><xsl:value-of select="sitemap:lastmod"/></td>
              </tr>
            </xsl:for-each>
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2">Total URLs: <xsl:value-of select="count(sitemap:urlset/sitemap:url)"/></td>
            </tr>
          </tfoot>
        </table>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
