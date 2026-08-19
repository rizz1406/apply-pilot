\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{resume}[2026/08/19 ApplyPilot resume template]
\LoadClass[10pt]{article}
\usepackage{enumitem}
\usepackage{titlesec}
\usepackage{tabularx}
\pagenumbering{gobble}
\setlength{\parindent}{0pt}
\setlength{\parskip}{0pt}
\newcommand{\name}[1]{\begin{center}\LARGE\bfseries #1\end{center}}
\newcommand{\address}[1]{\begin{center}\small #1\end{center}}
\newenvironment{rSection}[1]{\vspace{4pt}\textbf{\MakeUppercase{#1}}\par\vspace{1pt}\hrule\vspace{3pt}}{\vspace{2pt}}
\renewenvironment{itemize}{\begin{itemize}[leftmargin=14pt,itemsep=-2pt,topsep=2pt]}{\end{itemize}}
