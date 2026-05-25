# make the plot look better
def prettify(fig, linewidth=1.5, fontsize=14):
    # set constrainted layout
    fig.set_constrained_layout(True)

    # create list of all the axes
    axes = fig.axes
    sub_axes = []
    from matplotlib.axes import Axes
    for ax in axes:
        # find inset axes and append them
        sub_axes = sub_axes + [c for c in ax.get_children() if isinstance(c, Axes)]
    axes = axes + sub_axes
    
    # for every axis in the figure
    for ax in axes:
        # set font sizes of axes, title, and tick labels
        ax.xaxis.label.set_fontsize(fontsize)
        ax.yaxis.label.set_fontsize(fontsize)
        ax.title.set_fontsize(fontsize)

        ax.tick_params(axis='x', labelsize=fontsize)
        ax.tick_params(axis='y', labelsize=fontsize)
        
        # set border thickness and add inward pointing ticks on all four sides
        ax.tick_params(direction='in', length=4, width=linewidth, which='both', top=True, right=True)
        for spine in ax.spines.values():
            spine.set_linewidth(linewidth)
    
    # make legend outline black and make corners square
    from matplotlib.legend import Legend
    legends = fig.findobj(Legend)
    for legend in legends:
        legend.get_frame().set_edgecolor('0')
        legend.get_frame().set_boxstyle('Square', pad=0)
        legend.get_frame().set_linewidth(linewidth)