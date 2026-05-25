function prettify(opts)
% PRETTIFY  Makes MATLAB plots more pretty and publication-worthy.
%   PRETTIFY will by default clean up the current figure and axes.
%
%   OPTIONAL ARGUMENTS
%   fig:       figure handle/number (default is gcf)
%   ax:        axis object (default is gca)
%   fontsize:  size of axes font (and colorbar if provided)
%   linewidth: linewidth of axes
%   s:         pcolor object, if relevant
%   c:         colorbar object, if relevant
%   l:         legend object, if relevant
%
%   Written by Paul M. Neves
    arguments
        opts.ax = gca
        opts.fig = gcf
        opts.fontsize=12
        opts.linewidth=1.5
        opts.s=1 % pcolor object
        opts.c=1 % colorbar object
        opts.l=1 % legend object
    end
    set(opts.fig, color='w');
    set(opts.ax, FontSize=opts.fontsize, ...
        XColor='black', ...
        YColor='black', ...
        ZColor='black', ...
        color='w', ...
        LineWidth=opts.linewidth);
    box(opts.ax, 'on');
    if opts.s~=1 % for colormaps
        opts.s.EdgeColor = 'none';
        set(opts.ax, 'layer', 'top');
    end
    if opts.c~=1 % for colorbars
        opts.c.LineWidth = opts.linewidth;
        opts.c.FontSize=opts.fontsize;
        opts.c.Color='k';
    end
    if opts.l~=1 % for legends
        opts.l.EdgeColor = 'k';
        opts.l.TextColor = 'k';
        opts.l.Color='w';
    end
end